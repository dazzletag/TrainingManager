import json
import sys
from datetime import date


def parse_date(value):
    if not value:
        return None
    try:
        return date.fromisoformat(value)
    except ValueError:
        return None


def sort_key(employee):
    completed = parse_date(employee.get("last_completed_date"))
    # Missing completion dates should be prioritised first.
    return completed or date(1900, 1, 1)


def recommend(employees):
    return sorted(employees, key=sort_key)


def main():
    payload = json.load(sys.stdin)
    employees = payload.get("employees", [])
    recommended = recommend(employees)
    json.dump({"recommended": recommended}, sys.stdout)


if __name__ == "__main__":
    main()
