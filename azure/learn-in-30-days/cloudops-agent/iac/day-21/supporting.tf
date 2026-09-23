# Supplied platform integration for the source-review exercise.
# The platform team manages the existing network, private DNS zone, encryption
# identity, Key Vault/key, and Log Analytics workspace named by these data sources.
# The vault uses RBAC, purge protection, and permits the Storage service to use
# its key. The private DNS zone is already linked to the application's network.
# These are review assumptions, not resources deployed by this lab.

data "azurerm_user_assigned_identity" "storage_encryption" {
  name                = "id-cloudops-storage"
  resource_group_name = "rg-platform"
}

data "azurerm_key_vault" "platform" {
  name                = "kv-cloudops-platform"
  resource_group_name = "rg-platform"
}

data "azurerm_key_vault_key" "storage" {
  name         = "cloudops-storage"
  key_vault_id = data.azurerm_key_vault.platform.id
}

resource "azurerm_role_assignment" "storage_encryption" {
  scope                = data.azurerm_key_vault.platform.id
  role_definition_name = "Key Vault Crypto Service Encryption User"
  principal_id         = data.azurerm_user_assigned_identity.storage_encryption.principal_id
}

data "azurerm_subnet" "private_endpoints" {
  name                 = "private-endpoints"
  virtual_network_name = "vnet-cloudops"
  resource_group_name  = "rg-cloudops"
}

data "azurerm_private_dns_zone" "blob" {
  name                = "privatelink.blob.core.windows.net"
  resource_group_name = "rg-platform"
}

resource "azurerm_private_endpoint" "runbooks" {
  name                = "pe-cloudops-runbooks"
  location            = azurerm_storage_account.cloudops.location
  resource_group_name = "rg-cloudops"
  subnet_id           = data.azurerm_subnet.private_endpoints.id

  private_service_connection {
    name                           = "cloudops-blob"
    private_connection_resource_id = azurerm_storage_account.cloudops.id
    subresource_names              = ["blob"]
    is_manual_connection           = false
  }

  private_dns_zone_group {
    name                 = "blob"
    private_dns_zone_ids = [data.azurerm_private_dns_zone.blob.id]
  }
}

data "azurerm_log_analytics_workspace" "platform" {
  name                = "law-cloudops-platform"
  resource_group_name = "rg-platform"
}

# Blob diagnostics apply to all containers in this storage account.
# CKV2_AZURE_21 in the pinned scanner only recognizes legacy storage insights,
# not this diagnostic setting. See the narrowly scoped exception in .checkov.yml.
resource "azurerm_monitor_diagnostic_setting" "blob" {
  name                       = "cloudops-blob-logs"
  target_resource_id         = "${azurerm_storage_account.cloudops.id}/blobServices/default"
  log_analytics_workspace_id = data.azurerm_log_analytics_workspace.platform.id

  enabled_log {
    category = "StorageRead"
  }

  enabled_log {
    category = "StorageWrite"
  }

  enabled_log {
    category = "StorageDelete"
  }
}
