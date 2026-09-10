# Make Cosmos DB private with Terraform

Use this starter in the temporary Cybr environment. The hosted guide explains the resource discovery commands and each network change.

The website, Function API, Cosmos DB, data permissions, and VNet already exist.
The Function already has VNet integration. The `private-endpoints` subnet is available for the database connection.

## Files

- `provider.tf` pins AzureRM 5.2.0 and AzAPI 2.8.0. Both use Azure CLI authentication.
- `main.tf` declares inputs and the existing Cosmos account ID. It creates no database resources.
- `private-access.tf.example` adds a private endpoint, a private DNS zone, and its VNet link.
- `block-public.tf.example` updates the existing account's `publicNetworkAccess` property to `Disabled`.
- `probe.py` reads the incident collection with your Azure CLI identity through the public endpoint.

## Workflow

Verify that the application saves an incident and the public probe succeeds.
Then copy `private-access.tf.example` to `private-access.tf` and apply the three networking resources.
Copy `block-public.tf.example` to `block-public.tf` and apply the account-property update.
Verify that the public probe reports a network restriction and the application still saves incidents.

The Function has read/write permission at the incident container scope.
Your learner identity has read-only permission at that scope for the public probe.
Account-key authentication stays disabled.

## State and cleanup

The platform owns the Cosmos account, database, container, and data roles.
It ignores changes to the account's `public_network_access_enabled` property.
The learner's AzAPI update manages only the corresponding `publicNetworkAccess` property, without importing the account.

Keep Cloud Shell open through cleanup. Its temporary disk holds this sandbox's Terraform state.
Review the removal plan, then run `terraform destroy` before completing the lab.
Terraform removes three networking resources and the AzAPI update record from state.
Destroying the update record does not restore public access or remove the database.
The platform removes the database and prepared environment when the sandbox ends.

## Probe behavior

Run the probe with the account name and the expected result:

```bash
python3 probe.py --account "$COSMOS_ACCOUNT" --expect allowed
```

The `--account` argument selects the database. The `--expect` argument accepts `allowed` or `blocked`.
The script keeps the token in memory and prints only the response category.
A timeout, authentication failure, or permission failure does not count as a network restriction.
An unexpected result returns exit code 1.

## Author validation

Formatting and provider validation do not prove live Azure behavior.
A release requires both public probe results, incident persistence after private access, and successful learner and platform teardown.
Verify that a platform plan preserves the learner's disabled public-access setting.

The [AzAPI update resource documentation](https://github.com/Azure/terraform-provider-azapi/blob/v2.8.0/docs/resources/update_resource.md) defines the property-update and cleanup behavior.
