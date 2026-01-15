import importlib.util
import os
import sys
import tempfile
from typing import Dict

import requests

KEY_VAULT_NAME = "tmkvmke0gyn2"
STAFFDETAILS_URL = "https://raw.githubusercontent.com/dazzletag/TrainingManager/main/staffdetails.py"


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

    raise RuntimeError("Managed identity endpoint not available.")


def fetch_secret(token: str, secret_name: str) -> str:
    url = f"https://{KEY_VAULT_NAME}.vault.azure.net/secrets/{secret_name}?api-version=7.4"
    response = requests.get(url, headers={"Authorization": f"Bearer {token}"}, timeout=30)
    response.raise_for_status()
    return response.json()["value"]


def load_staffdetails_module() -> object:
    response = requests.get(STAFFDETAILS_URL, timeout=60)
    response.raise_for_status()
    temp_dir = tempfile.mkdtemp(prefix="planday-import-")
    script_path = os.path.join(temp_dir, "staffdetails.py")
    with open(script_path, "wb") as handle:
        handle.write(response.content)
    spec = importlib.util.spec_from_file_location("staffdetails", script_path)
    if not spec or not spec.loader:
        raise RuntimeError("Unable to load staffdetails module.")
    module = importlib.util.module_from_spec(spec)
    sys.modules["staffdetails"] = module
    spec.loader.exec_module(module)
    return module


def main() -> None:
    token = get_managed_identity_token("https://vault.azure.net")
    secrets: Dict[str, str] = {
        "PLANDAY_CLIENT_ID": "planday-client-id",
        "PLANDAY_REFRESH_TOKEN": "planday-refresh-token",
        "DB_PASSWORD": "db-password",
        "PLANDAY_TRAINING_MATRIX_URL": "planday-training-matrix-url",
    }
    for env_name, secret_name in secrets.items():
        os.environ[env_name] = fetch_secret(token, secret_name)

    os.environ.setdefault("DB_HOST", "tm-trainingmgr-sql.database.windows.net")
    os.environ.setdefault("DB_NAME", "training_manager")
    os.environ.setdefault("DB_USERNAME", "tmadmin")

    staffdetails = load_staffdetails_module()
    staffdetails.main()


if __name__ == "__main__":
    main()
