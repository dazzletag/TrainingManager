# Planday Import Job

This job reads employee custom training fields from Planday and upserts them into the TrainingManager database.

## Required environment variables

- `PLANDAY_ACCESS_TOKEN` (or `PLANDAY_API_TOKEN`)
- `PLANDAY_CLIENT_ID` (required when using refresh-token flow, optional otherwise)
- `PLANDAY_REFRESH_TOKEN` (required when using refresh-token flow)
- `PLANDAY_TOKEN_URL` (optional, default `https://id.planday.com/connect/token`)
- `PLANDAY_HR_BASE_URL` (optional, default `https://openapi.planday.com/hr/v1`)
- `PLANDAY_DEFAULT_VALIDITY_MONTHS` (optional, default `12`)
- `PLANDAY_COURSE_VALIDITY_FILE` (optional path to a JSON map of course name -> validity months)
- `PLANDAY_DEFAULT_ROLE_NAME` (optional, default `Imported Staff`)

- `DB_HOST`
- `DB_PORT` (optional, default `1433`)
- `DB_NAME`
- `DB_USERNAME`
- `DB_PASSWORD`
- `DB_DRIVER` (optional, default `ODBC Driver 18 for SQL Server`)
- `DB_TRUST_CERT` (optional, `true` to trust the server certificate)

## Run

```
python -m pip install -r scripts/planday_requirements.txt
python staffdetails.py
```
