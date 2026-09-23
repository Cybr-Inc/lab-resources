# Day 21: Review the proposed CloudOps release

This directory holds a proposed Terraform change for the CloudOps application.
Nothing here has been deployed. The task is to review the change against the
organization's infrastructure requirements before it reaches Azure.

## Organization requirements

1. Operational runbooks must not allow anonymous Blob access.
2. Storage accounts must disable Shared Key authorization.
3. Deleted blobs must remain recoverable for seven days.
4. Cosmos DB must use identity-based access, with local/key authentication disabled.
5. Production Cosmos DB accounts must disable public network access.
6. CloudOps resources must use the `eastus` region.
7. The Function's Cosmos data-role assignment must be scoped to the `incidents`
   container.

## Files

- `main.tf` — the proposed change. It contains violations of the requirements above.
- `supporting.tf` — supplied private-endpoint, encryption-access, and Blob
  diagnostic settings. Its data sources reference existing platform services.
- `policy/cloudops-region.yaml` — a custom Checkov policy for requirement 6.
- `policy/cloudops-role-scope.yaml` — a custom Checkov policy for requirement 7.
- `.checkov.yml` — records the exceptions described below.
- `scan.sh` — the release check. It fails while any violation remains.

## Run the scan

Install Checkov, then run it from this directory:

```bash
checkov --directory . --framework terraform
checkov --directory . --framework terraform --external-checks-dir policy
```

The first command runs the built-in checks. The second also loads the
organization's custom policies.

The starter reports seven built-in failures for five configuration mistakes.
After those repairs, the custom policies find the region and role-scope violations.

## Supplied platform configuration

The proposed storage account uses a customer-managed key. `supporting.tf`
references an existing key and identity and grants the identity access to that
key. The file also connects a Blob private endpoint to an existing subnet and
private DNS zone. Blob diagnostic settings send read, write, and delete events
to an existing Log Analytics workspace. The settings cover both containers.

These existing services are assumptions of the source-review scenario. This
lab does not deploy them. Learners repair `main.tf`, not `supporting.tf`.

## Recorded scan exceptions

- `CKV_AZURE_33`: the application uses Blob storage, not queues. This is an
  existing exception for queue logging.
- `CKV_AZURE_100`: Cosmos DB uses its default Microsoft-managed encryption.
  This is an existing exception for Cosmos customer-managed keys.
- `CKV2_AZURE_21`: Checkov 3.2.490 and 3.3.19 only recognize legacy
  `azurerm_log_analytics_storage_insights` for this rule. They do not recognize
  the Blob diagnostic settings in `supporting.tf`. The exception covers this
  scanner limitation; the diagnostic configuration remains in the source.
