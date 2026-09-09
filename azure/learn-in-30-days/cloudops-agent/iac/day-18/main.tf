# The resource group already exists and is not managed by this configuration.

variable "resource_group_name" {
  description = "Name of the existing learner data resource group."
  type        = string
}

variable "location" {
  description = "Azure region of the learner data resource group."
  type        = string
}

variable "account_name" {
  description = "Globally unique name for the Cosmos DB account."
  type        = string

  validation {
    condition     = can(regex("^[a-z0-9-]{3,44}$", var.account_name))
    error_message = "Use 3 to 44 lowercase letters, digits, or hyphens for the account name."
  }
}

locals {
  database_name  = "cloudops"
  container_name = "incidents"
  common_tags = {
    Environment = "LabAccount"
    LabScenario = "azure-deploy-cosmos-terraform"
    CostCenter  = "Labs"
    Owner       = "LabsTeam"
    Lifetime    = "Temporary"
    Purpose     = "CloudOpsIncidentHistory"
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
  public_network_access_enabled      = true

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

output "account_endpoint" {
  value = azurerm_cosmosdb_account.cosmos.endpoint
}

output "account_name" {
  value = azurerm_cosmosdb_account.cosmos.name
}

output "container_id" {
  value = azurerm_cosmosdb_sql_container.incidents.id
}
