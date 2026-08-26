# Blob Storage Upload Failure

- Owner: Storage Operations
- Last reviewed: 2026-08-25
- Procedure code: BLOB-UPLOAD-GREEN

## Scope

When an approved application cannot upload a blob, use this runbook.

## Read-only checks

1. Record the storage account, container, blob path, and failed request time in UTC.
2. Examine the failed request status and `x-ms-request-id` response header.
3. Examine the caller's data-plane role assignment at the narrowest applicable scope.

Do not enable anonymous access or distribute an account key as a workaround.

## Escalation

If the role is correct and failures continue, escalate to Storage Operations. Include procedure code `BLOB-UPLOAD-GREEN` and the `x-ms-request-id` value.
