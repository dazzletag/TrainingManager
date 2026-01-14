# TrainingManager

Mandatory Training & Competency platform built with a React + Node/TypeScript stack, evidence-first rules, role-aware UX, and Azure-native infrastructure.

## What’s included

- **Backend (`backend/`)** – Express + TypeORM API, clear domain model (Person, Role, TrainingRequirement, Assignment, Evidence, AuditLog), Planday sync service, and OpenAPI spec.
- **Frontend (`frontend/`)** – React + TypeScript with Material UI and React Query; role switcher lets you preview Staff, Manager, Admin experiences without recreating Power Apps.
- **Infra (`infra/`)** – Bicep template that provisions Azure SQL, App Service, and Key Vault, wiring managed identities and app settings for secrets.
- **Scheduler & Planday autop** – Manager-focused session builder that surfaces due-first staff, lets you drag home-coloured cards into Day 1/Day 2 drop zones, and, once published, removes them from conflicting shifts and replaces them with a dedicated training shift unless they are on holiday.

## Getting started

1. **Backend**
   ```bash
   cd backend
   npm install
   cp .env.example .env   # add DB_* and PLANDAY_* values
   npm run migrate
   npm run seed
   npm run dev
   ```
   - The API listens on `http://localhost:4000` by default and uses `x-user-role`/`x-user-email` headers as a placeholder for Azure AD claims.
   - Browse `backend/openapi.yaml` to understand available routes.

2. **Frontend**
   ```bash
   cd frontend
   npm install
   export VITE_API_BASE_URL=http://localhost:4000/api/v1
   npm run dev
   ```
   - Role, person external ID, and user email can be adjusted via the role switcher in the top-right corner.
   - Use the Manager and Admin tabs to inspect compliance summaries, overrides, and audit logs.

3. **Infrastructure**
   - Deploy `infra/main.bicep` with Azure CLI to create SQL, App Service, and Key Vault in one shot. See `infra/README.md` for parameters.
   - After deployment, point frontend `VITE_API_BASE_URL` at the App Service hostname and configure backend env vars from the provisioned SQL/Key Vault.

## Environment variables

### Backend

- `DB_HOST`, `DB_NAME`, `DB_USERNAME`, `DB_PASSWORD` – Azure SQL connection.
- `PLANDAY_API_URL` & `PLANDAY_API_TOKEN` – used by the background sync job (fetches `/roles` and `/employees`, assumes `id`, `roleId`, `employmentStatus`, etc.).
- `PLANDAY_SYNC_INTERVAL_MS` – optional override for the sync cadence (default 30 minutes).
- `PLANDAY_TRAINING_SHIFT_POSITION_ID` – the Planday position that represents the training shift (required when publishing sessions).
- `PLANDAY_TRAINING_SHIFT_START_HOUR` & `PLANDAY_TRAINING_SHIFT_END_HOUR` – hour of day used to build shift windows for `assignToTrainingShift` (defaults to 09:00-17:00 local time).
- `PLANDAY_TRAINING_SHIFT_NOTE_PREFIX` – human-friendly prefix added to shift notes so operators can trace a Planday entry back to the TrainingManager session.
- `AZURE_AUTH_ENABLED` – flip to `true` once the App Service and API have Azure AD/Entra ID integration so the middleware validates bearer tokens issued by Microsoft.
- `AZURE_TENANT_ID` + `AZURE_CLIENT_ID` – consumed by `azureAuthMiddleware` to confirm the issuer/audience, populate `req.user` with `oid/roles/preferred_username`, and keep fake headers disabled.
- Secrets belong in Key Vault; the App Service identity can be granted `get`/`list` permissions and the values injected as app settings.

### Frontend

- `VITE_API_BASE_URL` – e.g., `https://trainingmanager.azurewebsites.net/api/v1`.
- `VITE_DEMO_PERSON_EXTERNAL_ID` – default staff profile external ID for the staff dashboard (matches seed data).

## Domain & design notes

- All compliance statuses are derived from evidence: `Evidence` includes `validFrom/validTo`, `confidenceLevel`, and `uploadedFileKey`.
- `Assignment` links `Person` ↔ `TrainingRequirement` without storing completion flags.
- `TrainingRequirement` → `Role` uses a many-to-many join so regulators can inspect which obligations apply per role category.
- `AuditLog` captures `who`, `what`, `when`, `why` for approvals, evidence uploads, and requirement creations.
- Planday sync stores immutable external IDs and avoids redundant HR data; the service is idempotent and uses env vars for API secrets.

## Operations & validation

- Run `npm run build` in both `backend/` and `frontend/` to perform full TypeScript and bundler validations (already verified in this repo).
- The backend exposes:
  - `GET /api/v1/staff/profile?externalId={id}` for staff dashboards.
  - `POST /api/v1/staff/{personId}/evidence` to ingest proof.
  - `GET /api/v1/manager/compliance` and `/manager/at-risk` for leaders.
  - `GET /api/v1/admin/audit` and `/admin/training-requirements`.
  - `GET /api/v1/scheduler/overview` / `POST /api/v1/scheduler/sessions` / `POST /api/v1/scheduler/assign` for the drag-and-drop manager workflow.
  - `POST /api/v1/scheduler/sessions/{sessionId}/publish` to instruct Planday (handles shift removal, holiday skips, and training shift creation).
- React queries hydrate these endpoints and merchant the role-based UX stack.

- The frontend is deployed to `https://trainingmanager-frontend.azurewebsites.net` and reads `VITE_API_BASE_URL` from App Service configuration (currently pointing to the backend). Run `npm run build` and deploy `frontend/dist` via a run-from-package zip whenever you change the UI.
- The frontend now hosts an Express-based server (`server.js`) so `npm start` can serve `dist`. Deploy by running `npm run build`, packaging the entire `frontend/` directory, and running `az webapp deployment source config-zip` (the App Service has `npm start` as its startup command and `WEBSITE_RUN_FROM_PACKAGE=0` so the server can load `package.json`).

## Azure resource plan

- **Azure SQL Database** – managed relational store with TypeORM migrations (`backend/src/db/migrations/InitialSchema.ts`).
- **App Service + Plan** – hosts the Node API with a system-assigned identity; Bicep ensures the identity can read Key Vault secrets.
- **Key Vault** – stores DB credentials, Planday token, and future API secrets.

The Bicep template wires the App Service to the SQL server and exposes outputs (`sqlServerHost`, `appEndpoint`) for configuration.

### Key Vault secrets & App Service wiring

- `tmkvmke0gyn2` now contains secrets `db-password`, `planday-api-token`, `azure-tenant-id`, and `azure-client-id`. These are the values the App Service should reference via `@Microsoft.KeyVault(SecretUri=...)`.
- The same vault also hosts `planday-training-shift-position-id`, `planday-training-shift-start-hour`, `planday-training-shift-end-hour`, and `planday-training-shift-note-prefix` so the published training shifts can be reconfigured without redeploying code.
- Azure CLI on this machine struggled to inject those references directly (the CLI split parentheses through the Windows shell), so the App Service currently holds the plaintext host, DB name, and non-secret flags. Use the Azure Portal, `Set-AzWebApp` in PowerShell, or a properly quoted `az resource update` call to replace `DB_PASSWORD`, `PLANDAY_API_TOKEN`, `AZURE_TENANT_ID`, and `AZURE_CLIENT_ID` with the secret URIs above.
- Once you have a real App Registration for tokens, set `AZURE_AUTH_ENABLED=true` and update `AZURE_CLIENT_ID` to the registration’s application ID so the backend switches from the mock headers to Entra ID tokens.

## Future expansion ideas

1. **Mobile-friendly proxy** – wrap the REST API with a dedicated mobile shell or expose GraphQL for mobile apps to fetch evidence timelines.
2. **Revalidation workflows** – schedule revalidation campaigns tied to `validTo` + `ValidityPeriod` and notify managers via Teams/Email.
3. **Evidence sharing/trust** – integrate Proof-of-Work templates, store signed PDFs in Azure Storage, and publish traceable certificates to regulators.

Feel free to iterate on the backend services, enrich front-end dashboards, or extend the Bicep template with networking/storage as regulators and operations demand.
