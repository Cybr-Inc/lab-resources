# Employee Microsoft Entra Sign-in Failure

- Owner: Identity Operations
- Last reviewed: 2026-08-25
- Procedure code: ENTRA-SIGNIN-BLUE

## Scope
When an employee cannot sign in to a company application, use this runbook.

## Read-only checks
1. Record the employee name, application name, and failed sign-in time in UTC.
2. Examine the Entra sign-in log for the matching event and error code.
3. Examine the account status and the applicable access policy.

Do not reset credentials or change a policy during the initial investigation.

## Escalation
After three matching failures, escalate to Identity Operations. Include procedure code `ENTRA-SIGNIN-BLUE` and the sign-in correlation ID.
