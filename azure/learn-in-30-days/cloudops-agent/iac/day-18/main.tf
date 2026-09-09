# The same Cosmos DB resources and API versions as the Day 17 Bicep starter.
# The resource group already exists and is not managed by this configuration.

variable "resource_group_id" {
  description = "Resource ID of the existing learner data resource group."
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

resource "azapi_resource" "cosmos" {
  type      = "Microsoft.DocumentDB/databaseAccounts@2024-11-15"
  name      = var.account_name
  parent_id = var.resource_group_id
  location  = var.location
  tags      = local.common_tags

  body = {
    kind = "GlobalDocumentDB"
    properties = {
      capabilities = [{ name = "EnableServerless" }]
      consistencyPolicy = {
        defaultConsistencyLevel = "Session"
      }
      databaseAccountOfferType           = "Standard"
      disableKeyBasedMetadataWriteAccess = true
      disableLocalAuth                   = true
      enableAutomaticFailover            = false
      enableMultipleWriteLocations       = false
      locations = [{
        failoverPriority = 0
        isZoneRedundant  = false
        locationName     = var.location
      }]
      minimalTlsVersion   = "Tls12"
      publicNetworkAccess = "Enabled"
    }
  }

  response_export_values = ["properties.documentEndpoint"]
}

resource "azapi_resource" "database" {
  type      = "Microsoft.DocumentDB/databaseAccounts/sqlDatabases@2024-11-15"
  name      = local.database_name
  parent_id = azapi_resource.cosmos.id

  body = {
    properties = {
      resource = {
        id = local.database_name
      }
    }
  }
}

resource "azapi_resource" "incidents" {
  type      = "Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2024-11-15"
  name      = local.container_name
  parent_id = azapi_resource.database.id

  body = {
    properties = {
      resource = {
        id = local.container_name
        partitionKey = {
          kind    = "Hash"
          paths   = ["/severity"]
          version = 2
        }
      }
    }
  }
}

output "account_endpoint" {
  value = azapi_resource.cosmos.output.properties.documentEndpoint
}

output "account_name" {
  value = azapi_resource.cosmos.name
}

output "container_id" {
  value = azapi_resource.incidents.id
}
