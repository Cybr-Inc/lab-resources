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

CloudOps browser
  -> GET or POST /api/incidents
  -> managed Function
  -> managed identity
  -> Azure Cosmos DB incident container
```

The application-status tool accepts an application name from a fixed enum. The
server maps that name to an environment-specific URL. The model cannot provide
an arbitrary URL.

The fixed map limits requests through the tool. The customer status endpoint is
public, but the runbook container requires Azure authentication. The API uses
one `ManagedIdentityCredential` for Foundry, Blob Storage, and Cosmos DB.

## Day 16 patch

From the root of the cloned `lab-resources` repository, apply the Day 16 learner patch:

```bash
git apply azure/learn-in-30-days/cloudops-agent/patches/day-16-managed-identity.patch
```

The patch replaces the client-secret credentials with one shared
`ManagedIdentityCredential`. Foundry and Blob Storage then use the managed
identity of the hosted Function app.

## Day 17 Bicep

`iac/day-17/main.bicep` is the starter Bicep template for Day 17. It creates a
serverless Cosmos DB account, database, and incident container. It disables
local key authentication when it creates the account.

The starter template does not grant the Function access to incident data. This
missing role assignment creates the expected failure in the lab. Apply the
learner patch from the repository root:

```bash
git apply azure/learn-in-30-days/cloudops-agent/patches/day-17-cosmos-role.patch
```

The patch assigns the Cosmos DB Built-in Data Contributor role to the Function
managed identity. The assignment applies only to the incident container.

The customer status endpoint reports its current release settings. It does not
call the sample orders dependency. Thus, a healthy result proves that the
required server setting exists, not that the downstream service is available.

The customer application supplies the incident target for the lab. Follow the
lab guide before you examine its source so that you can investigate the runtime
evidence first.
