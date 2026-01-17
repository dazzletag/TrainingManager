# Project Orientation (TrainingManager)

This repo hosts the Training Manager app deployed to Azure. Use this note to avoid re-discovering the setup.

## Azure Apps
- Backend (API): `trainingmanager-backend` (Web App)
- Frontend (UI): `trainingmanager-frontend` (Web App)
- Reporting (Functions): `trainingmanager-reporting` (Function App)

## Deployment Workflow (Always deploy, commit, push)
We use zip deployments. Build is done by Oryx in Azure (no local `npm install` needed if the zip has source + package.json).

Backend:
1) Zip from `backend/` root (not the repo root).
2) Ensure app settings:
   - `SCM_DO_BUILD_DURING_DEPLOYMENT=1`
   - `ENABLE_ORYX_BUILD=true`
   - `WEBSITE_RUN_FROM_PACKAGE=0`
3) Deploy:
   - `az webapp deployment source config-zip -g BCHSystems -n trainingmanager-backend --src .deploy/backend.zip`

Frontend:
1) Zip from `frontend/` root.
2) Ensure app settings:
   - `SCM_DO_BUILD_DURING_DEPLOYMENT=1`
   - `ENABLE_ORYX_BUILD=true`
   - `WEBSITE_RUN_FROM_PACKAGE=0`
3) Deploy:
   - `az webapp deployment source config-zip -g BCHSystems -n trainingmanager-frontend --src .deploy/frontend.zip`

Reporting:
1) Zip from `reporting/` root.
2) Ensure app settings:
   - `SCM_DO_BUILD_DURING_DEPLOYMENT=1`
   - `ENABLE_ORYX_BUILD=true`
   - `WEBSITE_RUN_FROM_PACKAGE=0`
3) Deploy:
   - `az functionapp deployment source config-zip -g BCHSystems -n trainingmanager-reporting --src .deploy/reporting.zip`

## Local Dev
- Backend: `npm --prefix backend run dev`
- Frontend: `npm --prefix frontend run dev`

## Key Features / Logic Notes
- "Next Best Courses" API: `GET /api/v1/recommendations/next-courses`
- Filtering excludes certain course names (see `backend/src/routes/recommendations.ts`).
- Reporting Matrix: Essential SCTV only (requiredLevel=1 + name contains SCTV).
- Required level is the only classification; mandatory flag has been removed.

## Data Utilities
- Merge duplicate "Next Due" requirements:
  - `node backend/scripts/mergeNextDueRequirements.js --apply`
  - `node backend/scripts/mergeNextDueRequirements.js --rename`

## Troubleshooting
- CORS errors from the frontend often mean the backend is down.
  - Check: `https://trainingmanager-backend.azurewebsites.net/health`
  - If 503 or timeouts, check Kudu logs and confirm Oryx build settings.
- Reporting 500s often mean Functions were deployed without deps.
  - Re-deploy reporting with Oryx settings above.

## Commit / Sync
Always commit and push after changes. Do not amend unless explicitly requested.
