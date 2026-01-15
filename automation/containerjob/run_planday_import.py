import os
import sys
import requests


def get_managed_identity_token(resource: str) -> str:
    identity_endpoint = os.getenv("IDENTITY_ENDPOINT")
    identity_header = os.getenv("IDENTITY_HEADER")
    if identity_endpoint and identity_header:
        response = requests.get(
            identity_endpoint,
            params={"resource": resource, "api-version": "2019-08-01"},
            headers={"X-IDENTITY-HEADER": identity_header},
            timeout=30,
        )
        response.raise_for_status()
        return response.json()["access_token"]

    msi_endpoint = os.getenv("MSI_ENDPOINT")
    msi_secret = os.getenv("MSI_SECRET")
    if msi_endpoint and msi_secret:
        response = requests.get(
            msi_endpoint,
            params={"resource": resource, "api-version": "2017-09-01"},
            headers={"Secret": msi_secret},
            timeout=30,
        )
        response.raise_for_status()
        return response.json()["access_token"]

    imds_url = "http://169.254.169.254/metadata/identity/oauth2/token"
    response = requests.get(
        imds_url,
        params={"resource": resource, "api-version": "2018-02-01"},
        headers={"Metadata": "true"},
        timeout=30,
    )
    response.raise_for_status()
    return response.json()["access_token"]


def fetch_secret(token: str, vault_name: str, secret_name: str) -> str:
    url = f"https://{vault_name}.vault.azure.net/secrets/{secret_name}?api-version=7.4"
    response = requests.get(url, headers={"Authorization": f"Bearer {token}"}, timeout=30)
    response.raise_for_status()
    return response.json()["value"]


def populate_env_from_key_vault() -> None:
    vault_name = os.getenv("KEY_VAULT_NAME", "tmkvmke0gyn2")
    token = get_managed_identity_token("https://vault.azure.net")
    secrets = {
        "PLANDAY_CLIENT_ID": os.getenv("PLANDAY_CLIENT_ID_SECRET", "planday-client-id"),
        "PLANDAY_REFRESH_TOKEN": os.getenv("PLANDAY_REFRESH_TOKEN_SECRET", "planday-refresh-token"),
        "DB_PASSWORD": os.getenv("DB_PASSWORD_SECRET", "db-password"),
        "PLANDAY_TRAINING_MATRIX_URL": os.getenv(
            "PLANDAY_TRAINING_MATRIX_URL_SECRET", "planday-training-matrix-url"
        ),
    }
    for env_name, secret_name in secrets.items():
        os.environ[env_name] = fetch_secret(token, vault_name, secret_name)


def main() -> int:
    populate_env_from_key_vault()

    os.environ.setdefault("DB_HOST", "tm-trainingmgr-sql.database.windows.net")
    os.environ.setdefault("DB_NAME", "training_manager")
    os.environ.setdefault("DB_USERNAME", "tmadmin")
    os.environ.setdefault("DB_PORT", "1433")
    os.environ.setdefault("DB_DRIVER", "ODBC Driver 18 for SQL Server")

    import staffdetails

    return int(staffdetails.main())


if __name__ == "__main__":
    sys.exit(main())
