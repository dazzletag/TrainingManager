import requests

PLANDAY_CLIENT_ID = "a079a6c5-a90f-45e9-8bd1-a1dcd3002cc3"
REFRESH_TOKEN = "eioqZEd0P0WkdYCiqa99Mg"

TOKEN_URL = "https://id.planday.com/connect/token"
DEPARTMENTS_URL = "https://openapi.planday.com/hr/v1/departments"


def get_access_token():
    payload = {
        "client_id": PLANDAY_CLIENT_ID,
        "grant_type": "refresh_token",
        "refresh_token": REFRESH_TOKEN,
    }

    headers = {
        "Content-Type": "application/x-www-form-urlencoded"
    }

    response = requests.post(TOKEN_URL, data=payload, headers=headers)
    response.raise_for_status()

    return response.json()["access_token"]


def get_departments(access_token):
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json",
        "X-ClientId": PLANDAY_CLIENT_ID,
    }

    response = requests.get(DEPARTMENTS_URL, headers=headers)
    response.raise_for_status()

    return response.json()


def get_department_table():
    access_token = get_access_token()
    data = get_departments(access_token)

    # Power Query ultimately expands id + name
    departments = data.get("data", [])

    return [
        {
            "id": dept.get("id"),
            "name": dept.get("name"),
        }
        for dept in departments
    ]


if __name__ == "__main__":
    departments = get_department_table()
    for d in departments:
        print(d)
