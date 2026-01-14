# Infrastructure

This folder defines the Azure resources required for the TrainingManager platform via a single Bicep template (`main.bicep`).

## Provisioning

```bash
az deployment group create \
  --resource-group <rg-name> \
  --template-file infra/main.bicep \
  --parameters \
    sqlServerName=<unique-sql-name> \
    sqlAdministratorLogin=<admin> \
    sqlAdministratorLoginPassword=<secure-password> \
    appServiceName=<app-name> \
    keyVaultName=<kv-name>
```

- `sqlServerName`: must be globally unique.
- `appServiceName`: will host the backend API.
- `keyVaultName`: holds secrets (connection strings, Planday tokens).

The Bicep defines:

- Azure SQL Server + database + firewall rule (allows Azure services).
- Premium App Service plan + Web App with a system-assigned identity.
- Key Vault granting the Web App access to secrets.

After deployment, record:

- SQL server host & credentials.
- App Service default hostname (for `VITE_API_BASE_URL`).
- Key Vault URI for wiring `DB_PASSWORD`, `PLANDAY_API_TOKEN`, etc.

Further automation can extend this template to include App Service deployment slots, storage accounts for evidence, or API Management as needed.
