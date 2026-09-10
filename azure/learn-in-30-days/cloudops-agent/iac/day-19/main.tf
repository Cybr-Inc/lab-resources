# Cosmos DB, its data permissions, the application and VNet already exist.
# This workspace creates private access and manages only publicNetworkAccess
# on the existing account. It does not import or own the account itself.
variable "resource_group_name" {
  description = "Existing empty resource group for learner networking resources."
  type        = string
}

variable "checkpoint_resource_group_name" {
  description = "Existing resource group containing Cosmos DB, the app and VNet."
  type        = string
}

variable "location" {
  description = "Region of the prepared VNet."
  type        = string
}

variable "account_name" {
  description = "Name of the existing Cosmos DB account."
  type        = string
}

variable "virtual_network_name" {
  description = "Existing VNet with separate integration and endpoint subnets."
  type        = string
}

variable "brand" {
  description = "Organization tag from the existing resource group."
  type        = string
  default     = "cybr"
}

data "azurerm_client_config" "current" {}

locals {
  cosmos_account_id = "/subscriptions/${data.azurerm_client_config.current.subscription_id}/resourceGroups/${var.checkpoint_resource_group_name}/providers/Microsoft.DocumentDB/databaseAccounts/${var.account_name}"
  common_tags = {
    Environment  = "LabAccount"
    LabScenario  = "azure-private-cosmos-terraform"
    CostCenter   = "Labs"
    Organization = var.brand
    Owner        = "LabsTeam"
    Lifetime     = "Temporary"
  }
}
