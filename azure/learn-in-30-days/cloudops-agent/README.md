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

The fixed map limits requests through the tool. It does not make the target
private. This lab keeps the customer status endpoint and runbook container
public so that learners can examine the complete request path.

The customer status endpoint reports its current release settings. It does not
call the sample orders dependency. Thus, a healthy result proves that the
required server setting exists, not that the downstream service is available.

The customer application supplies the incident target for the lab. Follow the
lab guide before you examine its source so that you can investigate the runtime
evidence first.
