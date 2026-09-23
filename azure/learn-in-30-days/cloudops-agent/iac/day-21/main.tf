# =============================================================================
# Proposed CloudOps release: incident history and runbook storage.
#
# This file is a review draft. It has not been deployed. Several settings break
# the organization's infrastructure requirements, which are listed in the lab
# guide and in README.md. The scanner finds them before anything reaches Azure.
#
# The resource group "rg-cloudops" and the Function App already exist and are
# not managed by this configuration.
# =============================================================================

variable "function_principal_id" {
  description = "Object ID of the existing Function App managed identity."
  type        = string
}

# --- Runbook storage ---------------------------------------------------------

# Requirement: CloudOps resources must use the eastus region.
# VIOLATION: this storage account uses an unapproved region.
resource "azurerm_storage_account" "cloudops" {
  name                            = "cloudopsrunbooks"
  resource_group_name             = "rg-cloudops"
  location                        = "westus"
  account_tier                    = "Standard"
  account_replication_type        = "GRS"
  min_tls_version                 = "TLS1_2"
  public_network_access_enabled   = false
  allow_nested_items_to_be_public = false
}

# Requirement: operational runbooks must not allow anonymous Blob access.
# VIOLATION: this container allows anonymous read access to its blobs.
resource "azurerm_storage_container" "runbooks" {
  name                  = "operational-runbooks"
  storage_account_name  = azurerm_storage_account.cloudops.name
  container_access_type = "blob"
}

# This container keeps the default private access and is compliant.
resource "azurerm_storage_container" "archives" {
  name                  = "archives"
  storage_account_name  = azurerm_storage_account.cloudops.name
  container_access_type = "private"
}

# --- Incident history ---------------------------------------------------------

# Requirement: Cosmos DB must use identity-based access only.
# VIOLATION: local (key-based) authentication is enabled.
#
# Requirement: production Cosmos DB accounts must disable public network access.
# VIOLATION: public network access is enabled.
resource "azurerm_cosmosdb_account" "incident_history" {
  name                               = "cosmoscloudops"
  resource_group_name                = "rg-cloudops"
  location                           = "eastus"
  offer_type                         = "Standard"
  kind                               = "GlobalDocumentDB"
  local_authentication_disabled      = false
  access_key_metadata_writes_enabled = false
  public_network_access_enabled      = true
  minimal_tls_version                = "Tls12"

  capabilities {
    name = "EnableServerless"
  }

  consistency_policy {
    consistency_level = "Session"
  }

  geo_location {
    location          = "eastus"
    failover_priority = 0
  }
}

resource "azurerm_cosmosdb_sql_database" "cloudops" {
  name                = "cloudops"
  resource_group_name = "rg-cloudops"
  account_name        = azurerm_cosmosdb_account.incident_history.name
}

resource "azurerm_cosmosdb_sql_container" "incidents" {
  name                = "incidents"
  resource_group_name = "rg-cloudops"
  account_name        = azurerm_cosmosdb_account.incident_history.name
  database_name       = azurerm_cosmosdb_sql_database.cloudops.name
  partition_key_paths = ["/severity"]
}

# Requirement: the Function's Cosmos data role is scoped to the incidents
# container, not the whole account.
#
# VIOLATION: the scope grants data-plane access at the account level. A
# container-scoped assignment ends with /dbs/cloudops/colls/incidents.
resource "azurerm_cosmosdb_sql_role_assignment" "function_incident_writer" {
  name                = "00000000-0000-0000-0000-000000000003"
  resource_group_name = "rg-cloudops"
  account_name        = azurerm_cosmosdb_account.incident_history.name
  principal_id        = var.function_principal_id
  role_definition_id  = "/subscriptions/00000000-0000-0000-0000-000000000000/resourceGroups/rg-cloudops/providers/Microsoft.DocumentDB/databaseAccounts/cosmoscloudops/sqlRoleDefinitions/00000000-0000-0000-0000-000000000002"
  scope               = "/subscriptions/00000000-0000-0000-0000-000000000000/resourceGroups/rg-cloudops/providers/Microsoft.DocumentDB/databaseAccounts/cosmoscloudops"
}
