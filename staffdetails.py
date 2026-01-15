import calendar
import datetime as dt
import json
import logging
import os
import re
import sys
import tempfile
import time
from typing import Any, Dict, Iterable, List, Optional, Tuple

import pyodbc
import requests
import pandas as pd

DEFAULT_PAGE_SIZE = 50
DEFAULT_VALIDITY_MONTHS = int(os.getenv("PLANDAY_DEFAULT_VALIDITY_MONTHS", "12"))
STATUS_FIELDS = {"Has Resigned", "On Parental Leave"}
ONE_OFF_YEARS = {20, 50}


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
        return value.astimezone(dt.UTC) if value.tzinfo else value.replace(tzinfo=dt.UTC)
    if isinstance(value, dt.date):
        return dt.datetime.combine(value, dt.time.min).replace(tzinfo=dt.UTC)
    if isinstance(value, (int, float)):
        return None
    if isinstance(value, str):
        text = value.strip()
        if not text:
            return None
        if text.endswith("Z"):
            text = text.replace("Z", "+00:00")
        try:
            parsed = dt.datetime.fromisoformat(text)
            return parsed.astimezone(dt.UTC) if parsed.tzinfo else parsed.replace(tzinfo=dt.UTC)
        except ValueError:
            for fmt in ("%Y-%m-%d", "%d/%m/%Y"):
                try:
                    return dt.datetime.strptime(text, fmt).replace(tzinfo=dt.UTC)
                except ValueError:
                    continue
    return None


def add_months(value: dt.datetime, months: int) -> dt.datetime:
    month = value.month - 1 + months
    year = value.year + month // 12
    month = month % 12 + 1
    day = min(value.day, calendar.monthrange(year, month)[1])
    return value.replace(year=year, month=month, day=day)


def load_training_matrix() -> Tuple[Dict[int, List[Dict[str, Any]]], Dict[int, str]]:
    path = os.getenv(
        "PLANDAY_TRAINING_MATRIX_FILE",
        r"C:\Users\Darren\OneDrive - Bristol Care Homes\Desktop\trainingRqmt.xlsx",
    )
    matrix_url = os.getenv("PLANDAY_TRAINING_MATRIX_URL", "").strip()
    temp_file = None
    if matrix_url:
        response = requests.get(matrix_url, timeout=60)
        response.raise_for_status()
        temp_file = tempfile.NamedTemporaryFile(delete=False, suffix=".xlsx")
        temp_file.write(response.content)
        temp_file.flush()
        temp_file.close()
        path = temp_file.name
    if not os.path.exists(path):
        raise RuntimeError(f"Training matrix not found at {path}")

    sheet1 = pd.read_excel(path, sheet_name="Sheet1")
    sheet2 = pd.read_excel(path, sheet_name="Sheet2")

    group_names = {}
    for _, row in sheet2.iterrows():
        try:
            group_id = int(row.get("id"))
        except (TypeError, ValueError):
            continue
        group_names[group_id] = str(row.get("name"))

    required: Dict[int, List[Dict[str, Any]]] = {}
    for _, row in sheet1.iterrows():
        group_id = row.get("EmployeeGroup")
        if pd.isna(group_id):
            continue
        try:
            group_id = int(group_id)
        except (TypeError, ValueError):
            continue

        course = str(row.get("Compliant Title") or row.get("Course") or "").strip()
        if not course:
            continue
        period_years = row.get("Period")
        try:
            period_years = int(period_years)
        except (TypeError, ValueError):
            period_years = 0
        needed = row.get("Needed")
        try:
            needed = int(needed)
        except (TypeError, ValueError):
            needed = 1

        required.setdefault(group_id, []).append(
            {
                "course": course,
                "needed": needed,
                "period_years": period_years,
            }
        )

    if temp_file:
        try:
            os.unlink(temp_file.name)
        except OSError:
            pass

    return required, group_names


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


def fetch_departments(session: requests.Session) -> Dict[int, str]:
    base_url = os.getenv("PLANDAY_HR_BASE_URL", "https://openapi.planday.com/hr/v1.0")
    departments: Dict[int, str] = {}
    offset = 0
    total = None

    while total is None or offset < total:
        params = {"offset": offset, "limit": DEFAULT_PAGE_SIZE}
        response = session.get(f"{base_url}/departments", params=params, timeout=30)
        response.raise_for_status()
        payload = response.json()
        page = payload.get("data", [])
        paging = payload.get("paging", {})
        total = paging.get("total", len(page))
        for item in page:
            try:
                dept_id = int(item.get("id"))
            except (TypeError, ValueError):
                continue
            name = str(item.get("name") or "").strip()
            if name:
                departments[dept_id] = name
        offset += len(page)
        if not page:
            break
        logging.info("Fetched %s/%s departments", offset, total)

    return departments


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


def extract_employee_groups(detail: Dict[str, Any], summary: Dict[str, Any]) -> List[int]:
    groups = detail.get("employeeGroups") or summary.get("employeeGroups") or []
    if isinstance(groups, list):
        ids: List[int] = []
        for item in groups:
            if isinstance(item, dict):
                value = item.get("id")
            else:
                value = item
            try:
                ids.append(int(value))
            except (TypeError, ValueError):
                continue
        return ids
    return []


def build_custom_field_map(fields: List[Dict[str, Any]]) -> Dict[str, Any]:
    values: Dict[str, Any] = {}
    for field in fields:
        name = field.get("name")
        if not name:
            continue
        values[name] = field.get("value")
    return values


def lookup_custom_field(values: Dict[str, Any], course_label: str) -> Any:
    if course_label in values:
        return values[course_label]
    normalized = normalize_course_name(course_label)
    for key, value in values.items():
        if normalize_course_name(str(key)) == normalized:
            return value
    return None


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


def fetch_lookup_maps(
    cursor: pyodbc.Cursor,
) -> Tuple[
    Dict[str, Any],
    Dict[str, Any],
    Dict[str, Any],
    Dict[Tuple[str, str], str],
    Dict[Tuple[str, str], Dict[str, Any]],
    Dict[str, set],
]:
    roles_by_external: Dict[str, Dict[str, Any]] = {}
    roles_by_name: Dict[str, Dict[str, Any]] = {}
    cursor.execute("SELECT id, externalId, name FROM role")
    for row in cursor.fetchall():
        roles_by_external[row.externalId] = {"id": row.id, "name": row.name}
        roles_by_name[row.name] = {"id": row.id, "externalId": row.externalId}

    requirements_by_name: Dict[str, Dict[str, Any]] = {}
    cursor.execute("SELECT id, name, validityPeriodMonths, mandatory, requiredLevel, category FROM training_requirement")
    for row in cursor.fetchall():
        requirements_by_name[row.name] = {
            "id": row.id,
            "validityPeriodMonths": row.validityPeriodMonths,
            "mandatory": bool(row.mandatory),
            "requiredLevel": row.requiredLevel,
            "category": row.category,
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

    requirement_group_links: Dict[Tuple[str, str], Dict[str, Any]] = {}
    try:
        cursor.execute(
            "SELECT requirementId, roleId, requiredLevel, mandatory FROM training_requirement_group"
        )
        for row in cursor.fetchall():
            requirement_group_links[(str(row.requirementId), str(row.roleId))] = {
                "requiredLevel": row.requiredLevel,
                "mandatory": bool(row.mandatory),
            }
    except pyodbc.Error:
        requirement_group_links = {}

    person_group_links: Dict[str, set] = {}
    try:
        cursor.execute("SELECT personId, roleId FROM person_group")
        for row in cursor.fetchall():
            person_group_links.setdefault(str(row.personId), set()).add(str(row.roleId))
    except pyodbc.Error:
        person_group_links = {}

    return (
        roles_by_external,
        roles_by_name,
        persons_by_external,
        assignments_by_key,
        requirement_group_links,
        person_group_links,
    )


def ensure_role(
    cursor: pyodbc.Cursor,
    roles_by_external: Dict[str, Dict[str, Any]],
    roles_by_name: Dict[str, Dict[str, Any]],
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

    return role_id


def ensure_group_role(
    cursor: pyodbc.Cursor,
    roles_by_external: Dict[str, Dict[str, Any]],
    roles_by_name: Dict[str, Dict[str, Any]],
    group_id: int,
    group_name: Optional[str],
) -> str:
    name = group_name.strip() if group_name else f"Group {group_id}"
    external_id = f"planday-group-{group_id}"
    if external_id in roles_by_external:
        return roles_by_external[external_id]["id"]
    if name in roles_by_name:
        return roles_by_name[name]["id"]

    cursor.execute(
        "INSERT INTO role (id, externalId, name, category, description, createdAt, updatedAt) "
        "VALUES (NEWID(), ?, ?, ?, ?, GETUTCDATE(), GETUTCDATE())",
        external_id,
        name,
        "Employee Group",
        "Imported from Planday employee group",
    )
    cursor.execute("SELECT id FROM role WHERE externalId = ?", external_id)
    role_id = str(cursor.fetchone().id)
    roles_by_external[external_id] = {"id": role_id, "name": name}
    roles_by_name[name] = {"id": role_id, "externalId": external_id}

    return role_id


def ensure_requirement(
    cursor: pyodbc.Cursor,
    requirements_by_name: Dict[str, Dict[str, Any]],
    name: str,
    validity_months: int,
    mandatory: bool,
    category: Optional[str],
    required_level: int,
) -> str:
    existing = requirements_by_name.get(name)
    if existing:
        updates = []
        params: List[Any] = []
        if existing.get("validityPeriodMonths") != validity_months:
            updates.append("validityPeriodMonths = ?")
            params.append(validity_months)
        if existing.get("mandatory") != mandatory:
            updates.append("mandatory = ?")
            params.append(1 if mandatory else 0)
        if existing.get("requiredLevel") != required_level:
            updates.append("requiredLevel = ?")
            params.append(required_level)
        if existing.get("category") != category:
            updates.append("category = ?")
            params.append(category)
        if updates:
            params.append(existing["id"])
            cursor.execute(
                f"UPDATE training_requirement SET {', '.join(updates)}, updatedAt = GETUTCDATE() WHERE id = ?",
                *params,
            )
            existing.update(
                {
                    "validityPeriodMonths": validity_months,
                    "mandatory": mandatory,
                    "requiredLevel": required_level,
                    "category": category,
                }
            )
        return str(existing["id"])

    description = f"Imported from Planday training matrix ({name})"
    if category:
        description = f"{description}. Category: {category}"

    cursor.execute(
        "INSERT INTO training_requirement (id, name, description, validityPeriodMonths, mandatory, requiredLevel, category, createdAt, updatedAt) "
        "VALUES (NEWID(), ?, ?, ?, ?, ?, ?, GETUTCDATE(), GETUTCDATE())",
        name,
        description,
        validity_months,
        1 if mandatory else 0,
        required_level,
        category,
    )
    cursor.execute("SELECT id FROM training_requirement WHERE name = ?", name)
    requirement_id = str(cursor.fetchone().id)
    requirements_by_name[name] = {
        "id": requirement_id,
        "validityPeriodMonths": validity_months,
        "mandatory": mandatory,
        "requiredLevel": required_level,
        "category": category,
    }

    return requirement_id


def ensure_requirement_group_link(
    cursor: pyodbc.Cursor,
    requirement_group_links: Dict[Tuple[str, str], Dict[str, Any]],
    requirement_id: str,
    role_id: str,
    required_level: int,
    mandatory: bool,
) -> None:
    key = (requirement_id, role_id)
    existing = requirement_group_links.get(key)
    if existing:
        updates = []
        params: List[Any] = []
        if existing.get("requiredLevel") != required_level:
            updates.append("requiredLevel = ?")
            params.append(required_level)
        if existing.get("mandatory") != mandatory:
            updates.append("mandatory = ?")
            params.append(1 if mandatory else 0)
        if updates:
            params.extend([requirement_id, role_id])
            cursor.execute(
                f"UPDATE training_requirement_group SET {', '.join(updates)}, updatedAt = GETUTCDATE() "
                "WHERE requirementId = ? AND roleId = ?",
                *params,
            )
            existing.update({"requiredLevel": required_level, "mandatory": mandatory})
        return

    cursor.execute(
        "INSERT INTO training_requirement_group "
        "(id, requirementId, roleId, requiredLevel, mandatory, createdAt, updatedAt) "
        "VALUES (NEWID(), ?, ?, ?, ?, GETUTCDATE(), GETUTCDATE())",
        requirement_id,
        role_id,
        required_level,
        1 if mandatory else 0,
    )
    requirement_group_links[key] = {"requiredLevel": required_level, "mandatory": mandatory}


def remove_job_title_links(
    cursor: pyodbc.Cursor,
    requirement_group_links: Dict[Tuple[str, str], Dict[str, Any]],
) -> None:
    cursor.execute("SELECT id FROM role WHERE externalId LIKE 'planday-job-%'")
    role_ids = [str(row.id) for row in cursor.fetchall()]
    if not role_ids:
        return

    chunk_size = 200
    for start in range(0, len(role_ids), chunk_size):
        chunk = role_ids[start : start + chunk_size]
        placeholders = ",".join("?" for _ in chunk)
        cursor.execute(
            f"DELETE FROM training_requirement_group WHERE roleId IN ({placeholders})",
            *chunk,
        )

    for key in list(requirement_group_links.keys()):
        if key[1] in role_ids:
            requirement_group_links.pop(key, None)


def sync_person_groups(
    cursor: pyodbc.Cursor,
    person_group_links: Dict[str, set],
    person_id: str,
    role_ids: List[str],
) -> None:
    desired = set(role_ids)
    existing = person_group_links.get(person_id, set())
    to_add = desired - existing
    to_remove = existing - desired

    for role_id in to_add:
        cursor.execute("INSERT INTO person_group (personId, roleId) VALUES (?, ?)", person_id, role_id)
    if to_remove:
        chunk_size = 200
        remove_list = list(to_remove)
        for start in range(0, len(remove_list), chunk_size):
            chunk = remove_list[start : start + chunk_size]
            placeholders = ",".join("?" for _ in chunk)
            cursor.execute(
                f"DELETE FROM person_group WHERE personId = ? AND roleId IN ({placeholders})",
                person_id,
                *chunk,
            )

    person_group_links[person_id] = desired


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
    training_matrix, group_names = load_training_matrix()

    token = get_access_token()
    session = build_session(token)
    employees = fetch_employees(session)
    departments_by_id = fetch_departments(session)
    logging.info("Total employees fetched: %s", len(employees))

    connection = build_db_connection()
    connection.autocommit = False
    cursor = connection.cursor()

    (
        roles_by_external,
        roles_by_name,
        persons_by_external,
        assignments_by_key,
        requirement_group_links,
        person_group_links,
    ) = fetch_lookup_maps(cursor)
    remove_job_title_links(cursor, requirement_group_links)
    requirements_by_name: Dict[str, Dict[str, Any]] = {}
    cursor.execute("SELECT id, name, validityPeriodMonths, mandatory, requiredLevel, category FROM training_requirement")
    for row in cursor.fetchall():
        requirements_by_name[row.name] = {
            "id": row.id,
            "validityPeriodMonths": row.validityPeriodMonths,
            "mandatory": bool(row.mandatory),
            "requiredLevel": row.requiredLevel,
            "category": row.category,
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
        primary_department_id = employee.get("primaryDepartmentId") or detail.get("primaryDepartmentId")
        home_location = ""
        if primary_department_id is not None:
            try:
                home_location = departments_by_id.get(int(primary_department_id), "")
            except (TypeError, ValueError):
                home_location = ""

        existing_before = persons_by_external.get(employee_id)

        employee_groups = sorted(extract_employee_groups(detail, employee))
        group_role_ids: List[str] = []
        for group_id in employee_groups:
            group_role_id = ensure_group_role(
                cursor,
                roles_by_external,
                roles_by_name,
                group_id,
                group_names.get(group_id),
            )
            group_role_ids.append(group_role_id)
        primary_group_id = employee_groups[0] if employee_groups else None
        if primary_group_id is not None:
            role_id = ensure_group_role(
                cursor,
                roles_by_external,
                roles_by_name,
                primary_group_id,
                group_names.get(primary_group_id),
            )
        else:
            role_id = ensure_role(
                cursor,
                roles_by_external,
                roles_by_name,
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
        if group_role_ids:
            sync_person_groups(cursor, person_group_links, person_id, group_role_ids)

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

        custom_field_values = build_custom_field_map(fields)

        for group_id in employee_groups:
            course_rows = training_matrix.get(group_id, [])
            group_role_id = ensure_group_role(
                cursor,
                roles_by_external,
                roles_by_name,
                group_id,
                group_names.get(group_id),
            )
            for course in course_rows:
                course_name = normalize_course_name(course["course"])
                period_years = course.get("period_years", 0)
                is_one_off = period_years in ONE_OFF_YEARS
                validity_months = validity_overrides.get(course_name, max(period_years * 12, DEFAULT_VALIDITY_MONTHS))
                category = "one-off" if is_one_off else None
                needed = course.get("needed", 1)
                required_level = needed
                mandatory = needed in (1, 3)

                requirement_id = ensure_requirement(
                    cursor,
                    requirements_by_name,
                    course_name,
                    validity_months,
                    mandatory,
                    category,
                    required_level,
                )
                ensure_requirement_group_link(
                    cursor,
                    requirement_group_links,
                    requirement_id,
                    group_role_id,
                    required_level,
                    mandatory,
                )
                assignment_id = ensure_assignment(cursor, assignments_by_key, person_id, requirement_id)

                raw_value = lookup_custom_field(custom_field_values, course.get("course", ""))
                parsed_date = parse_date(raw_value)
                if not parsed_date:
                    continue

                if is_due_field(course.get("course", "")):
                    valid_to = parsed_date
                    valid_from = add_months(parsed_date, -validity_months)
                else:
                    valid_from = parsed_date
                    valid_to = add_months(parsed_date, validity_months)

                if is_one_off and valid_to < dt.datetime.now(dt.UTC):
                    valid_to = add_months(valid_from, 1200)

                uploaded_file_key = f"planday:{slugify(course.get('course', 'training'))}"
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
