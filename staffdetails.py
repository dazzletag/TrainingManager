import calendar
import datetime as dt
import json
import logging
import os
import re
import sys
import time
from typing import Any, Dict, Iterable, List, Optional, Tuple

import pyodbc
import requests

DEFAULT_PAGE_SIZE = 50
DEFAULT_VALIDITY_MONTHS = int(os.getenv("PLANDAY_DEFAULT_VALIDITY_MONTHS", "12"))
STATUS_FIELDS = {"Has Resigned", "On Parental Leave"}


def setup_logging() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(message)s",
    )


def slugify(value: str) -> str:
    value = value.lower().strip()
    value = re.sub(r"[^a-z0-9]+", "-", value)
    return value.strip("-") or "unknown"


def normalize_course_name(raw: str) -> str:
    name = re.sub(r"\s+", " ", raw.strip())
    name = re.sub(r"\s+completed$", "", name, flags=re.IGNORECASE)
    name = re.sub(r"\s+due$", "", name, flags=re.IGNORECASE)
    return name.strip()


def is_due_field(raw: str) -> bool:
    return bool(re.search(r"\bdue\b", raw, flags=re.IGNORECASE))


def parse_date(value: Any) -> Optional[dt.datetime]:
    if value is None or value == "":
        return None
    if isinstance(value, dt.datetime):
        return value
    if isinstance(value, dt.date):
        return dt.datetime.combine(value, dt.time.min)
    if isinstance(value, (int, float)):
        return None
    if isinstance(value, str):
        text = value.strip()
        if not text:
            return None
        if text.endswith("Z"):
            text = text.replace("Z", "+00:00")
        try:
            return dt.datetime.fromisoformat(text)
        except ValueError:
            for fmt in ("%Y-%m-%d", "%d/%m/%Y"):
                try:
                    return dt.datetime.strptime(text, fmt)
                except ValueError:
                    continue
    return None


def add_months(value: dt.datetime, months: int) -> dt.datetime:
    month = value.month - 1 + months
    year = value.year + month // 12
    month = month % 12 + 1
    day = min(value.day, calendar.monthrange(year, month)[1])
    return value.replace(year=year, month=month, day=day)


def load_validity_overrides() -> Dict[str, int]:
    path = os.getenv("PLANDAY_COURSE_VALIDITY_FILE", "")
    if not path:
        return {}
    if not os.path.exists(path):
        logging.warning("Validity overrides file not found: %s", path)
        return {}
    with open(path, "r", encoding="utf-8") as handle:
        data = json.load(handle)
    return {normalize_course_name(name): int(months) for name, months in data.items()}


def get_access_token() -> str:
    direct_token = os.getenv("PLANDAY_ACCESS_TOKEN") or os.getenv("PLANDAY_API_TOKEN")
    if direct_token:
        return direct_token

    token_url = os.getenv("PLANDAY_TOKEN_URL", "https://id.planday.com/connect/token")
    client_id = os.getenv("PLANDAY_CLIENT_ID")
    refresh_token = os.getenv("PLANDAY_REFRESH_TOKEN")
    if not client_id or not refresh_token:
        raise RuntimeError(
            "Missing PLANDAY_ACCESS_TOKEN/PLANDAY_API_TOKEN or PLANDAY_CLIENT_ID/PLANDAY_REFRESH_TOKEN."
        )

    response = requests.post(
        token_url,
        data={
            "client_id": client_id,
            "grant_type": "refresh_token",
            "refresh_token": refresh_token,
        },
        timeout=30,
    )
    response.raise_for_status()
    payload = response.json()
    token = payload.get("access_token")
    if not token:
        raise RuntimeError("Planday token response missing access_token.")
    return token


def build_session(token: str) -> requests.Session:
    client_id = os.getenv("PLANDAY_CLIENT_ID")
    session = requests.Session()
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
        "Accept": "application/json",
    }
    if client_id:
        headers["X-ClientId"] = client_id
    session.headers.update(headers)
    return session


def fetch_employees(session: requests.Session) -> List[Dict[str, Any]]:
    base_url = os.getenv("PLANDAY_HR_BASE_URL", "https://openapi.planday.com/hr/v1")
    employees: List[Dict[str, Any]] = []
    offset = 0
    total = None

    while total is None or offset < total:
        params = {"offset": offset, "limit": DEFAULT_PAGE_SIZE}
        response = session.get(f"{base_url}/employees", params=params, timeout=30)
        response.raise_for_status()
        payload = response.json()
        page = payload.get("data", [])
        paging = payload.get("paging", {})
        total = paging.get("total", len(page))
        employees.extend(page)
        offset += len(page)
        if not page:
            break
        logging.info("Fetched %s/%s employees", offset, total)

    return employees


def fetch_employee_detail(
    session: requests.Session, employee_id: str, retries: int = 3
) -> Dict[str, Any]:
    base_url = os.getenv("PLANDAY_HR_BASE_URL", "https://openapi.planday.com/hr/v1")
    url = f"{base_url}/employees/{employee_id}"
    for attempt in range(1, retries + 1):
        try:
            response = session.get(url, timeout=30)
            response.raise_for_status()
            payload = response.json()
            return payload.get("data", {}) or {}
        except (requests.RequestException, json.JSONDecodeError) as exc:
            logging.warning("Detail fetch failed for %s (attempt %s/%s): %s", employee_id, attempt, retries, exc)
            time.sleep(5)
    raise RuntimeError(f"Unable to fetch employee detail for {employee_id}")


def extract_custom_fields(detail: Dict[str, Any]) -> List[Dict[str, Any]]:
    fields: List[Dict[str, Any]] = []
    raw_fields = detail.get("customFields")
    if isinstance(raw_fields, list):
        for item in raw_fields:
            fields.append(
                {
                    "name": item.get("name"),
                    "type": item.get("type"),
                    "value": item.get("value"),
                }
            )
    for key, value in detail.items():
        if key.startswith("custom_") and isinstance(value, dict):
            fields.append(
                {
                    "name": value.get("name"),
                    "type": value.get("type"),
                    "value": value.get("value"),
                }
            )
    return [field for field in fields if field.get("name")]


def bool_value(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return value != 0
    if isinstance(value, str):
        return value.strip().lower() in {"true", "yes", "1"}
    return False


def build_db_connection() -> pyodbc.Connection:
    host = os.getenv("DB_HOST")
    port = os.getenv("DB_PORT", "1433")
    username = os.getenv("DB_USERNAME")
    password = os.getenv("DB_PASSWORD")
    database = os.getenv("DB_NAME")
    if not host or not username or not password or not database:
        raise RuntimeError("Missing DB_* environment variables.")
    driver = os.getenv("DB_DRIVER", "ODBC Driver 18 for SQL Server")
    trust_cert = os.getenv("DB_TRUST_CERT", "false").lower() == "true"
    server = f"{host},{port}"
    conn_str = (
        f"Driver={{{driver}}};"
        f"Server={server};"
        f"Database={database};"
        f"Uid={username};"
        f"Pwd={password};"
        "Encrypt=yes;"
        f"TrustServerCertificate={'yes' if trust_cert else 'no'};"
        "Connection Timeout=30;"
    )
    return pyodbc.connect(conn_str)


def fetch_lookup_maps(cursor: pyodbc.Cursor) -> Tuple[Dict[str, Any], Dict[str, Any], Dict[Tuple[str, str], str], Dict[Tuple[str, str], str], set]:
    roles_by_external: Dict[str, Dict[str, Any]] = {}
    roles_by_name: Dict[str, Dict[str, Any]] = {}
    cursor.execute("SELECT id, externalId, name FROM role")
    for row in cursor.fetchall():
        roles_by_external[row.externalId] = {"id": row.id, "name": row.name}
        roles_by_name[row.name] = {"id": row.id, "externalId": row.externalId}

    requirements_by_name: Dict[str, Dict[str, Any]] = {}
    cursor.execute("SELECT id, name, validityPeriodMonths FROM training_requirement")
    for row in cursor.fetchall():
        requirements_by_name[row.name] = {
            "id": row.id,
            "validityPeriodMonths": row.validityPeriodMonths,
        }

    persons_by_external: Dict[str, Dict[str, Any]] = {}
    cursor.execute(
        "SELECT id, externalId, fullName, email, employmentStatus, homeLocation, isActive, roleId FROM person"
    )
    for row in cursor.fetchall():
        persons_by_external[row.externalId] = {
            "id": row.id,
            "fullName": row.fullName,
            "email": row.email,
            "employmentStatus": row.employmentStatus,
            "homeLocation": row.homeLocation,
            "isActive": bool(row.isActive),
            "roleId": row.roleId,
        }

    assignments_by_key: Dict[Tuple[str, str], str] = {}
    cursor.execute("SELECT id, personId, requirementId FROM assignment")
    for row in cursor.fetchall():
        assignments_by_key[(str(row.personId), str(row.requirementId))] = str(row.id)

    evidence_by_key: Dict[Tuple[str, str], str] = {}
    cursor.execute(
        "SELECT id, assignmentId, uploadedFileKey FROM evidence WHERE uploadedFileKey LIKE 'planday:%'"
    )
    for row in cursor.fetchall():
        evidence_by_key[(str(row.assignmentId), row.uploadedFileKey)] = str(row.id)

    requirement_role_links = set()
    cursor.execute("SELECT trainingRequirementId, roleId FROM training_requirement_roles_role")
    for row in cursor.fetchall():
        requirement_role_links.add((str(row.trainingRequirementId), str(row.roleId)))

    return (
        roles_by_external,
        roles_by_name,
        persons_by_external,
        assignments_by_key,
        requirement_role_links,
    )


def ensure_role(
    cursor: pyodbc.Cursor,
    roles_by_external: Dict[str, Dict[str, Any]],
    roles_by_name: Dict[str, Dict[str, Any]],
    requirements_by_name: Dict[str, Dict[str, Any]],
    requirement_role_links: set,
    job_title: Optional[str],
) -> str:
    role_name = job_title.strip() if job_title else os.getenv("PLANDAY_DEFAULT_ROLE_NAME", "Imported Staff")
    if role_name in roles_by_name:
        return roles_by_name[role_name]["id"]

    external_id = f"planday-job-{slugify(role_name)}"
    cursor.execute(
        "INSERT INTO role (id, externalId, name, category, description, createdAt, updatedAt) "
        "VALUES (NEWID(), ?, ?, ?, ?, GETUTCDATE(), GETUTCDATE())",
        external_id,
        role_name,
        "Imported",
        "Imported from Planday job title",
    )
    cursor.execute("SELECT id FROM role WHERE externalId = ?", external_id)
    role_id = str(cursor.fetchone().id)
    roles_by_external[external_id] = {"id": role_id, "name": role_name}
    roles_by_name[role_name] = {"id": role_id, "externalId": external_id}

    for requirement in requirements_by_name.values():
        key = (str(requirement["id"]), role_id)
        if key not in requirement_role_links:
            cursor.execute(
                "INSERT INTO training_requirement_roles_role (trainingRequirementId, roleId) VALUES (?, ?)",
                requirement["id"],
                role_id,
            )
            requirement_role_links.add(key)

    return role_id


def ensure_requirement(
    cursor: pyodbc.Cursor,
    requirements_by_name: Dict[str, Dict[str, Any]],
    requirement_role_links: set,
    roles_by_name: Dict[str, Dict[str, Any]],
    name: str,
    validity_months: int,
) -> str:
    if name in requirements_by_name:
        return str(requirements_by_name[name]["id"])

    cursor.execute(
        "INSERT INTO training_requirement (id, name, description, validityPeriodMonths, mandatory, createdAt, updatedAt) "
        "VALUES (NEWID(), ?, ?, ?, 1, GETUTCDATE(), GETUTCDATE())",
        name,
        f"Imported from Planday custom field {name}",
        validity_months,
    )
    cursor.execute("SELECT id FROM training_requirement WHERE name = ?", name)
    requirement_id = str(cursor.fetchone().id)
    requirements_by_name[name] = {"id": requirement_id, "validityPeriodMonths": validity_months}

    for role in roles_by_name.values():
        key = (requirement_id, str(role["id"]))
        if key not in requirement_role_links:
            cursor.execute(
                "INSERT INTO training_requirement_roles_role (trainingRequirementId, roleId) VALUES (?, ?)",
                requirement_id,
                role["id"],
            )
            requirement_role_links.add(key)

    return requirement_id


def ensure_person(
    cursor: pyodbc.Cursor,
    persons_by_external: Dict[str, Dict[str, Any]],
    external_id: str,
    full_name: str,
    email: str,
    employment_status: str,
    home_location: str,
    is_active: bool,
    role_id: str,
) -> Tuple[str, bool]:
    existing = persons_by_external.get(external_id)
    if existing:
        updates = []
        params: List[Any] = []
        if existing["fullName"] != full_name:
            updates.append("fullName = ?")
            params.append(full_name)
        if existing["email"] != email:
            updates.append("email = ?")
            params.append(email)
        if existing["employmentStatus"] != employment_status:
            updates.append("employmentStatus = ?")
            params.append(employment_status)
        if existing["homeLocation"] != home_location:
            updates.append("homeLocation = ?")
            params.append(home_location)
        if existing["isActive"] != is_active:
            updates.append("isActive = ?")
            params.append(1 if is_active else 0)
        if str(existing["roleId"]) != str(role_id):
            updates.append("roleId = ?")
            params.append(role_id)
        if updates:
            params.append(external_id)
            cursor.execute(
                f"UPDATE person SET {', '.join(updates)}, updatedAt = GETUTCDATE() WHERE externalId = ?",
                *params,
            )
            persons_by_external[external_id].update(
                {
                    "fullName": full_name,
                    "email": email,
                    "employmentStatus": employment_status,
                    "homeLocation": home_location,
                    "isActive": is_active,
                    "roleId": role_id,
                }
            )
        return str(existing["id"]), False

    cursor.execute(
        "INSERT INTO person (id, externalId, fullName, email, employmentStatus, homeLocation, isActive, roleId, createdAt, updatedAt) "
        "VALUES (NEWID(), ?, ?, ?, ?, ?, ?, ?, GETUTCDATE(), GETUTCDATE())",
        external_id,
        full_name,
        email,
        employment_status,
        home_location,
        1 if is_active else 0,
        role_id,
    )
    cursor.execute("SELECT id FROM person WHERE externalId = ?", external_id)
    person_id = str(cursor.fetchone().id)
    persons_by_external[external_id] = {
        "id": person_id,
        "fullName": full_name,
        "email": email,
        "employmentStatus": employment_status,
        "homeLocation": home_location,
        "isActive": is_active,
        "roleId": role_id,
    }
    return person_id, True


def ensure_assignment(
    cursor: pyodbc.Cursor,
    assignments_by_key: Dict[Tuple[str, str], str],
    person_id: str,
    requirement_id: str,
) -> str:
    key = (person_id, requirement_id)
    if key in assignments_by_key:
        return assignments_by_key[key]

    cursor.execute(
        "INSERT INTO assignment (id, personId, requirementId, createdAt, updatedAt) "
        "VALUES (NEWID(), ?, ?, GETUTCDATE(), GETUTCDATE())",
        person_id,
        requirement_id,
    )
    cursor.execute(
        "SELECT id FROM assignment WHERE personId = ? AND requirementId = ?",
        person_id,
        requirement_id,
    )
    assignment_id = str(cursor.fetchone().id)
    assignments_by_key[key] = assignment_id
    return assignment_id


def upsert_evidence(
    cursor: pyodbc.Cursor,
    evidence_by_key: Dict[Tuple[str, str], str],
    assignment_id: str,
    uploaded_file_key: str,
    valid_from: dt.datetime,
    valid_to: dt.datetime,
    confidence: int,
) -> None:
    key = (assignment_id, uploaded_file_key)
    if key in evidence_by_key:
        cursor.execute(
            "UPDATE evidence SET validFrom = ?, validTo = ?, confidenceLevel = ?, updatedAt = GETUTCDATE() WHERE id = ?",
            valid_from,
            valid_to,
            confidence,
            evidence_by_key[key],
        )
        return

    cursor.execute(
        "INSERT INTO evidence (id, assignmentId, type, source, validFrom, validTo, uploadedFileKey, verifiedBy, confidenceLevel, createdAt, updatedAt) "
        "VALUES (NEWID(), ?, ?, ?, ?, ?, ?, ?, ?, GETUTCDATE(), GETUTCDATE())",
        assignment_id,
        "planday",
        "Planday",
        valid_from,
        valid_to,
        uploaded_file_key,
        "planday-sync",
        confidence,
    )
    cursor.execute(
        "SELECT id FROM evidence WHERE assignmentId = ? AND uploadedFileKey = ?",
        assignment_id,
        uploaded_file_key,
    )
    evidence_by_key[key] = str(cursor.fetchone().id)


def log_audit(cursor: pyodbc.Cursor, what: str, why: str) -> None:
    cursor.execute(
        "INSERT INTO audit_log (id, who, what, [when], why, createdAt) "
        "VALUES (NEWID(), ?, ?, GETUTCDATE(), ?, GETUTCDATE())",
        "planday-sync",
        what,
        why,
    )


def main() -> int:
    setup_logging()
    validity_overrides = load_validity_overrides()

    token = get_access_token()
    session = build_session(token)
    employees = fetch_employees(session)
    logging.info("Total employees fetched: %s", len(employees))

    connection = build_db_connection()
    connection.autocommit = False
    cursor = connection.cursor()

    roles_by_external, roles_by_name, persons_by_external, assignments_by_key, requirement_role_links = fetch_lookup_maps(
        cursor
    )
    requirements_by_name: Dict[str, Dict[str, Any]] = {}
    cursor.execute("SELECT id, name, validityPeriodMonths FROM training_requirement")
    for row in cursor.fetchall():
        requirements_by_name[row.name] = {
            "id": row.id,
            "validityPeriodMonths": row.validityPeriodMonths,
        }

    evidence_by_key: Dict[Tuple[str, str], str] = {}
    cursor.execute(
        "SELECT id, assignmentId, uploadedFileKey FROM evidence WHERE uploadedFileKey LIKE 'planday:%'"
    )
    for row in cursor.fetchall():
        evidence_by_key[(str(row.assignmentId), row.uploadedFileKey)] = str(row.id)

    new_people = 0
    resigned_people = 0
    parental_people = 0
    training_updates = 0

    processed = 0
    for employee in employees:
        employee_id = str(employee.get("id"))
        detail = fetch_employee_detail(session, employee_id)
        fields = extract_custom_fields(detail)

        resigned = False
        parental_leave = False
        for field in fields:
            if field.get("name") in STATUS_FIELDS:
                value = bool_value(field.get("value"))
                if field.get("name") == "Has Resigned":
                    resigned = value
                if field.get("name") == "On Parental Leave":
                    parental_leave = value

        full_name = f"{employee.get('firstName', '').strip()} {employee.get('lastName', '').strip()}".strip()
        full_name = full_name or detail.get("fullName") or "Unknown"
        email = employee.get("email") or detail.get("email") or f"{employee_id}@planday.local"
        employment_status = employee.get("employmentStatus") or detail.get("employmentStatus") or "Active"
        if resigned:
            employment_status = "Resigned"
        elif parental_leave:
            employment_status = "Parental Leave"
        home_location = employee.get("homeLocation") or detail.get("homeLocation") or str(employee.get("primaryDepartmentId") or "")

        existing_before = persons_by_external.get(employee_id)

        role_id = ensure_role(
            cursor,
            roles_by_external,
            roles_by_name,
            requirements_by_name,
            requirement_role_links,
            detail.get("jobTitle") or employee.get("jobTitle"),
        )

        person_id, is_new = ensure_person(
            cursor,
            persons_by_external,
            employee_id,
            full_name,
            email,
            employment_status,
            home_location,
            not resigned,
            role_id,
        )

        if is_new:
            new_people += 1
            log_audit(cursor, "person-added", f"Added {full_name} ({employee_id})")

        if existing_before:
            was_active = existing_before.get("isActive", True)
            if resigned and was_active:
                resigned_people += 1
                log_audit(cursor, "person-resigned", f"{full_name} marked as resigned")
            if parental_leave and not resigned and existing_before.get("employmentStatus") != "Parental Leave":
                parental_people += 1
                log_audit(cursor, "person-parental-leave", f"{full_name} marked on parental leave")
            if not parental_leave and existing_before.get("employmentStatus") == "Parental Leave":
                log_audit(cursor, "person-returned", f"{full_name} marked as returned from parental leave")

        for field in fields:
            name = field.get("name") or ""
            if name in STATUS_FIELDS:
                continue
            value = field.get("value")
            parsed_date = parse_date(value)
            if not parsed_date:
                continue
            normalized = normalize_course_name(name)
            validity_months = validity_overrides.get(normalized, DEFAULT_VALIDITY_MONTHS)
            requirement_id = ensure_requirement(
                cursor,
                requirements_by_name,
                requirement_role_links,
                roles_by_name,
                normalized,
                validity_months,
            )
            assignment_id = ensure_assignment(cursor, assignments_by_key, person_id, requirement_id)
            if is_due_field(name):
                valid_to = parsed_date
                valid_from = add_months(parsed_date, -validity_months)
            else:
                valid_from = parsed_date
                valid_to = add_months(parsed_date, validity_months)
            uploaded_file_key = f"planday:{slugify(name)}"
            upsert_evidence(
                cursor,
                evidence_by_key,
                assignment_id,
                uploaded_file_key,
                valid_from,
                valid_to,
                100,
            )
            training_updates += 1

        processed += 1
        if processed % 25 == 0 or processed == len(employees):
            logging.info("Processed %s/%s employees", processed, len(employees))

    connection.commit()
    logging.info("New employees: %s", new_people)
    logging.info("Resigned flags: %s", resigned_people)
    logging.info("Parental leave flags: %s", parental_people)
    logging.info("Training evidence updates: %s", training_updates)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        logging.error("Planday import failed: %s", exc)
        raise
