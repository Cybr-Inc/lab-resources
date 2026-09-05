metadata description = 'Deploys serverless Cosmos DB incident history for the CloudOps application.'

@description('Globally unique name for the Azure Cosmos DB account.')
@minLength(3)
@maxLength(44)
param accountName string

@description('Azure region for the incident history resources.')
param location string = resourceGroup().location

var databaseName = 'cloudops'
var containerName = 'incidents'
var commonTags = {
  Environment: 'LabAccount'
  LabScenario: 'azure-deploy-cosmos-bicep'
  CostCenter: 'Labs'
  Owner: 'LabsTeam'
  Lifetime: 'Temporary'
  Purpose: 'CloudOpsIncidentHistory'
}

resource cosmos 'Microsoft.DocumentDB/databaseAccounts@2024-11-15' = {
  name: accountName
  location: location
  kind: 'GlobalDocumentDB'
  tags: commonTags
  properties: {
    capabilities: [
      {
        name: 'EnableServerless'
      }
    ]
    consistencyPolicy: {
      defaultConsistencyLevel: 'Session'
    }
    databaseAccountOfferType: 'Standard'
    disableKeyBasedMetadataWriteAccess: true
    disableLocalAuth: true
    enableAutomaticFailover: false
    enableMultipleWriteLocations: false
    locations: [
      {
        failoverPriority: 0
        isZoneRedundant: false
        locationName: location
      }
    ]
    minimalTlsVersion: 'Tls12'
    publicNetworkAccess: 'Enabled'
  }
}

resource database 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases@2024-11-15' = {
  parent: cosmos
  name: databaseName
  properties: {
    resource: {
      id: databaseName
    }
  }
}

resource incidents 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2024-11-15' = {
  parent: database
  name: containerName
  properties: {
    resource: {
      id: containerName
      partitionKey: {
        kind: 'Hash'
        paths: [
          '/severity'
        ]
        version: 2
      }
    }
  }
}

output accountEndpoint string = cosmos.properties.documentEndpoint
output accountName string = cosmos.name
output containerId string = incidents.id
