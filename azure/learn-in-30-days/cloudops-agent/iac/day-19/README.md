# Make Cosmos DB private with Terraform

Use this starter inside the temporary environment supplied by the Cybr lab.
The hosted guide supplies the resource discovery commands and explains each action.

The environment includes a signed-in CloudOps website, its Function API, and a virtual network.
The Function already has VNet integration. The `private-endpoints` subnet is available for the database connection.

## Files

- `provider.tf` pins AzureRM 5.2.0 and uses Azure CLI authentication.
- `main.tf` creates serverless Cosmos DB, the database, the container, and two data-role assignments.
- `private-access.tf.example` adds a private endpoint, a private DNS zone, and its VNet link.
- `probe.py` reads the incident collection with your Azure CLI identity through the public endpoint.

The Function receives read/write access to the incident container.
Your learner identity receives read-only access for the public connectivity test.
Account-key authentication stays disabled throughout the exercise.

## Workflow

Apply the starter first. Verify that the website saves an incident and the public probe succeeds.
Then copy `private-access.tf.example` to `private-access.tf` and apply the three networking resources.
Set `public_network_access_enabled = false` in `terraform.tfvars` and apply the account change.
Verify that the public probe reports a network restriction and the website still saves incidents.

Keep Cloud Shell open through cleanup. Its temporary disk holds this sandbox's Terraform state.
Review the removal plan, then run `terraform destroy` before completing the lab.
Terraform removes eight learner resources. The prepared application, resource groups, VNet, and subnets have separate ownership.

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
