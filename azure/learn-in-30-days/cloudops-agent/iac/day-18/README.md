# Cosmos DB with Terraform

This starter repeats the Day 17 Bicep deployment in a fresh Azure sandbox.
It creates a serverless Cosmos DB account, the `cloudops` database, and the `incidents` container.
The container uses `/severity` as its partition key.

The Cybr lab guide supplies the resource group, region, account name, and Function identity through shell variables.
The group and Function already exist. This configuration does not manage them.

## Files

- `provider.tf` selects AzureRM 5.2.0 and Azure CLI authentication.
- `main.tf` defines the three starter resources and their outputs.
- `permission.tf.example` contains the missing data-role assignment for the repair task.

Terraform loads `.tf` files in the current directory. The `.example` suffix keeps the repair inactive until the learner copies it to `permission.tf`.

## AzureRM provider

AzureRM supplies resource types for the Cosmos DB account, SQL database, SQL container, and SQL role assignment.
The configuration uses their Terraform arguments. The provider selects the Azure API versions.

AzureRM 5.2.0 reads Cosmos account keys and connection strings during resource refresh and stores them in state.
The learner role permits those reads within the data resource group. It excludes key regeneration.
Local authentication remains disabled, and the Function uses managed identity for incident access.

The starter uses standard Terraform planning, state, dependencies, and cleanup.
It does not submit a Bicep or ARM template deployment.

## State

This exercise uses local state in `terraform.tfstate`. The file maps Terraform addresses to Azure resource IDs.
The lock file, `.terraform.lock.hcl`, records provider versions and checksums. It is not infrastructure state.

State and saved plans can contain sensitive values. The `.gitignore` file excludes them from Git.
Teams use a protected remote backend for shared state. Backend configuration is outside this introductory exercise.

Cloud Shell without storage is temporary. Complete the exercise and cleanup in the same session.

## Cleanup

The guide ends with `terraform destroy`. It removes the Cosmos resources tracked in the learner's state.
It does not remove the existing application or resource groups.
