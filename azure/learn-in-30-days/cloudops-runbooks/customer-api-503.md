# Customer API HTTP 503 After a Release

- Owner: Cloud Operations
- Last reviewed: 2026-08-25
- Procedure code: API-503-ORANGE

## Scope

When the customer API returns HTTP 503 after a release, use this runbook.

## Read-only checks

1. Record the release number and the first observed error time in UTC.
2. Examine the deployment log for a failed health check or startup error.
3. Compare the active release number with the last known healthy release.

Until the release owner approves the target version, do not redeploy or roll back.

## Escalation

If errors continue for 10 minutes, escalate to the release owner. Include procedure code `API-503-ORANGE`, the release number, and the deployment log link.
