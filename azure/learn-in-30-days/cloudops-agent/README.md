# CloudOps agent application

This source supports the CloudOps agent labs in Learn Azure in 30 Days. The
repository keeps the browser, managed Functions API, Foundry agent definition,
and tool implementations visible in one place.

## Projects

- `cloudops/` contains the authenticated support-agent interface and API.
- `customer-app/` contains the sample application that the agent examines.
- `agent/definition.js` contains the Foundry instructions and tool schemas.
- `scripts/configure-agent.js` creates a new version of `support-agent`.

## Request path

```text
CloudOps browser
  -> POST /api/chat
  -> Microsoft Foundry support-agent
  -> get_application_status or get_runbook
  -> managed Function executes the selected read-only tool
  -> Foundry writes an answer from the returned evidence
```

The application-status tool accepts an application name from a fixed enum. The
server maps that name to an environment-specific URL. The model cannot provide
an arbitrary URL.

## Intentional release defect

The customer API release expects `ORDERS_API_ENDPOINT`. The deployed application
setting is named `ORDER_API_ENDPOINT`. As a result, `/api/customer` and
`/api/status` return HTTP 503.

The status response includes setting names but never their values. Replacing
`ORDERS_API_ENDPOINT` with `ORDER_API_ENDPOINT` in
`customer-app/api/src/functions/customer.js` repairs the release.
