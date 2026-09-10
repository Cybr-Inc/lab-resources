# The application, resource groups and VNet already exist in this sandbox.
# This configuration owns only the database, data roles and private access.
variable "resource_group_name" {
  description = "Existing learner data resource group."
  type        = string
}

variable "checkpoint_resource_group_name" {
  description = "Existing resource group containing the app and VNet."
  type        = string
}

variable "location" {
  description = "Region of the prepared VNet and learner data group."
  type        = string
}

variable "account_name" {
  description = "Unique Cosmos account name expected by the prepared app."
  type        = string
  validation {
    condition     = can(regex("^[a-z0-9-]{3,44}$", var.account_name))
    error_message = "Use 3 to 44 lowercase letters, digits, or hyphens."
  }
}

variable "virtual_network_name" {
  description = "Existing VNet with the Function integration and endpoint subnets."
  type        = string
}

variable "function_principal_id" {
  description = "Object ID of the Function managed identity."
  type        = string
}

variable "public_network_access_enabled" {
  description = "Permit public data requests during the baseline test."
  type        = bool
  default     = true
}

variable "brand" {
  description = "Organization tag from the existing data group."
  type        = string
  default     = "cybr"
}

data "azurerm_client_config" "current" {}

locals {
  database_name  = "cloudops"
  container_name = "incidents"
  common_tags = {
    Environment  = "LabAccount"
    LabScenario  = "azure-private-cosmos-terraform"
    CostCenter   = "Labs"
    Organization = var.brand
    Owner        = "LabsTeam"
    Lifetime     = "Temporary"
  }
}

resource "azurerm_cosmosdb_account" "cosmos" {
  name                = var.account_name
  resource_group_name = var.resource_group_name
  location            = var.location
  offer_type          = "Standard"
  kind                = "GlobalDocumentDB"

  local_authentication_enabled       = false
  access_key_metadata_writes_enabled = false
  automatic_failover_enabled         = false
  multiple_write_locations_enabled   = false
  minimal_tls_version                = "Tls12"
  public_network_access_enabled      = var.public_network_access_enabled

  capabilities {
    name = "EnableServerless"
  }
  consistency_policy {
    consistency_level = "Session"
  }
  geo_location {
    location          = var.location
    failover_priority = 0
    zone_redundant    = false
  }
  tags = local.common_tags
}

resource "azurerm_cosmosdb_sql_database" "database" {
  name                = local.database_name
  resource_group_name = var.resource_group_name
  account_name        = azurerm_cosmosdb_account.cosmos.name
}

resource "azurerm_cosmosdb_sql_container" "incidents" {
  name                  = local.container_name
  resource_group_name   = var.resource_group_name
  account_name          = azurerm_cosmosdb_account.cosmos.name
  database_name         = azurerm_cosmosdb_sql_database.database.name
  partition_key_kind    = "Hash"
  partition_key_paths   = ["/severity"]
  partition_key_version = 2
}

# The Function writes incidents. The learner only reads them for the public test.
# Both permissions exist before the networking exercise starts.
resource "azurerm_cosmosdb_sql_role_assignment" "function_writer" {
  depends_on          = [azurerm_cosmosdb_sql_container.incidents]
  resource_group_name = var.resource_group_name
  account_name        = azurerm_cosmosdb_account.cosmos.name
  name                = uuidv5("url", "${azurerm_cosmosdb_account.cosmos.id}|${var.function_principal_id}|writer")
  principal_id        = var.function_principal_id
  role_definition_id  = "${azurerm_cosmosdb_account.cosmos.id}/sqlRoleDefinitions/00000000-0000-0000-0000-000000000002"
  scope               = "${azurerm_cosmosdb_account.cosmos.id}/dbs/${local.database_name}/colls/${local.container_name}"
}

resource "azurerm_cosmosdb_sql_role_assignment" "learner_reader" {
  depends_on          = [azurerm_cosmosdb_sql_container.incidents]
  resource_group_name = var.resource_group_name
  account_name        = azurerm_cosmosdb_account.cosmos.name
  name                = uuidv5("url", "${azurerm_cosmosdb_account.cosmos.id}|${data.azurerm_client_config.current.object_id}|reader")
  principal_id        = data.azurerm_client_config.current.object_id
  role_definition_id  = "${azurerm_cosmosdb_account.cosmos.id}/sqlRoleDefinitions/00000000-0000-0000-0000-000000000001"
  scope               = "${azurerm_cosmosdb_account.cosmos.id}/dbs/${local.database_name}/colls/${local.container_name}"
}
