# Day 21: Review the proposed CloudOps release

This directory holds a proposed Terraform change for the CloudOps application.
Nothing here has been deployed. The task is to review the change against the
organization's infrastructure requirements before it reaches Azure.

## Organization requirements

1. Cosmos DB must use identity-based access, with local/key authentication disabled.
2. Production Cosmos DB accounts must disable public network access.
3. CloudOps resources must use the `eastus` region.
4. The Function's Cosmos data-role assignment must be scoped to the `incidents`
   container.

## Files

- `main.tf` — the proposed change. It contains violations of the requirements above.
- `policy/cloudops-region.yaml` — a custom Checkov policy for requirement 3.
- `policy/cloudops-role-scope.yaml` — a custom Checkov policy for requirement 4.
- `.checkov.yml` — records the existing customer-managed-key exception. This
  exercise uses Cosmos DB's default encryption with Microsoft-managed keys.
- `scan.sh` — the release check. It fails while any violation remains.

## Run the scan

Install Checkov, then run it from this directory:

```bash
checkov --directory . --framework terraform
checkov --directory . --framework terraform --external-checks-dir policy
```

The first command runs the built-in checks. The second also loads the
organization's custom policies.

The starter reports three built-in failures for two configuration mistakes:
key-based authentication and public network access. After those repairs, the
custom policies find the region and role-scope violations.
