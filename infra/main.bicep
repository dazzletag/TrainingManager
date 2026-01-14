@description('Azure location for all resources')
param location string = resourceGroup().location

@description('Administrator login for Azure SQL')
param sqlAdministratorLogin string

@secure()
@description('Administrator password for Azure SQL')
param sqlAdministratorLoginPassword string

@description('SQL server name (must be globally unique)')
param sqlServerName string

@description('Logical database name')
param sqlDbName string = 'trainingdb'

@description('App Service name')
param appServiceName string

@description('App Service SKU')
param appServiceSkuName string = 'P1v2'

@description('Key Vault name')
param keyVaultName string

var appServicePlanName = '${appServiceName}-plan'

resource sqlServer 'Microsoft.Sql/servers@2022-05-01-preview' = {
  name: sqlServerName
  location: location
  properties: {
    administratorLogin: sqlAdministratorLogin
    administratorLoginPassword: sqlAdministratorLoginPassword
    version: '12.0'
    minimalTlsVersion: '1.2'
  }
}

resource sqlDatabase 'Microsoft.Sql/servers/databases@2021-02-01-preview' = {
  parent: sqlServer
  name: sqlDbName
  location: location
  sku: {
    name: 'S0'
    tier: 'Standard'
  }
  properties: {
    maxSizeBytes: 2147483648
  }
}

resource sqlFirewall 'Microsoft.Sql/servers/firewallRules@2021-02-01-preview' = {
  parent: sqlServer
  name: 'AllowAzureServices'
  properties: {
    startIpAddress: '0.0.0.0'
    endIpAddress: '0.0.0.0'
  }
}

resource appServicePlan 'Microsoft.Web/serverfarms@2022-09-01' = {
  name: appServicePlanName
  location: location
  sku: {
    name: appServiceSkuName
    tier: 'PremiumV2'
  }
  properties: {
    reserved: true
  }
}

resource webApp 'Microsoft.Web/sites@2022-09-01' = {
  name: appServiceName
  location: location
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    serverFarmId: appServicePlan.id
    siteConfig: {
      appSettings: [
        {
          name: 'WEBSITE_RUN_FROM_PACKAGE'
          value: '1'
        }
        {
          name: 'DB_HOST'
          value: sqlServer.properties.fullyQualifiedDomainName
        }
        {
          name: 'DB_NAME'
          value: sqlDatabase.name
        }
      ]
    }
  }
  dependsOn: [
    appServicePlan
    sqlDatabase
  ]
}

resource keyVault 'Microsoft.KeyVault/vaults@2022-07-01' = {
  name: keyVaultName
  location: location
  properties: {
    tenantId: subscription().tenantId
    sku: {
      family: 'A'
      name: 'standard'
    }
    accessPolicies: [
      {
        tenantId: subscription().tenantId
        objectId: webApp.identity.principalId
        permissions: {
          secrets: [
            'get'
            'list'
          ]
        }
      }
    ]
    enabledForDeployment: true
    enabledForTemplateDeployment: true
  }
  dependsOn: [
    webApp
  ]
}

output sqlServerHost string = sqlServer.properties.fullyQualifiedDomainName
output appEndpoint string = webApp.properties.defaultHostName
