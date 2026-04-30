terraform {
  required_version = ">= 1.0"
  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 3.0"
    }
  }
  backend "azurerm" {
    resource_group_name  = var.storage_resource_group
    storage_account_name = var.storage_account_name
    container_name       = "tfstate"
    key                  = "agent-eval-harness.terraform.tfstate"
  }
}

provider "azurerm" {
  features {}
}

# Get current client configuration
data "azurerm_client_config" "current" {}

# Resource Group
resource "azurerm_resource_group" "main" {
  name     = var.resource_group_name
  location = var.location
  tags     = var.tags
}

# VNet and Subnets
resource "azurerm_virtual_network" "main" {
  name                = "${var.app_name}-vnet"
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  address_space       = ["10.0.0.0/16"]
  tags                = var.tags
}

resource "azurerm_subnet" "container_apps" {
  name                 = "container-apps-subnet"
  resource_group_name  = azurerm_resource_group.main.name
  virtual_network_name = azurerm_virtual_network.main.name
  address_prefixes     = ["10.0.1.0/24"]
}

# Container Apps Module
module "container_apps" {
  source = "../../modules/azure-container-apps"

  app_name                    = var.app_name
  location                    = var.location
  environment                 = var.environment
  image_url                   = var.image_url
  cpu                         = var.cpu
  memory                      = var.memory
  min_replicas                = var.min_replicas
  max_replicas                = var.max_replicas
  create_resource_group       = false
  existing_resource_group_name = azurerm_resource_group.main.name
  subnet_id                   = azurerm_subnet.container_apps.id
  environment_variables       = var.environment_variables
  tags                        = var.tags
}

# Azure Database for PostgreSQL
resource "azurerm_postgresql_server" "main" {
  name                = "${var.app_name}-pg"
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name

  sku_name   = var.db_sku
  version    = var.db_version
  ssl_enforcement_enabled = true

  administrator_login          = var.db_admin_username
  administrator_login_password = var.db_admin_password

  storage_mb = var.db_storage_mb
  auto_grow_enabled = true
  backup_retention_days = 7
  geo_redundant_backup_enabled = false

  tags = var.tags
}

resource "azurerm_postgresql_firewall_rule" "allow_azure_services" {
  name                = "AllowAzureServices"
  resource_group_name = azurerm_resource_group.main.name
  server_name         = azurerm_postgresql_server.main.name
  start_ip_address    = "0.0.0.0"
  end_ip_address      = "0.0.0.0"
}

# Azure Cache for Redis
resource "azurerm_redis_cache" "main" {
  name                = "${var.app_name}-redis"
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  capacity            = var.redis_capacity
  family              = var.redis_family
  sku_name            = var.redis_sku_name

  enable_non_ssl_port = false
  minimum_tls_version = "1.2"

  redis_configuration {
    maxmemory_reserved = 100
    maxfragmentationmemory_reserved = 100
  }

  tags = var.tags
}

# Storage Account for trajectories and results
resource "azurerm_storage_account" "main" {
  name                     = "${var.app_name}storage"
  location                 = azurerm_resource_group.main.location
  resource_group_name      = azurerm_resource_group.main.name
  account_tier             = "Standard"
  account_replication_type = "LRS"

  tags = var.tags
}

resource "azurerm_storage_container" "trajectories" {
  name                  = "trajectories"
  storage_account_name  = azurerm_storage_account.main.name
  container_access_type = "private"
}

resource "azurerm_storage_container" "results" {
  name                  = "results"
  storage_account_name  = azurerm_storage_account.main.name
  container_access_type = "private"
}

# Application Insights
resource "azurerm_application_insights" "main" {
  name                = "${var.app_name}-ai"
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  workspace_id        = azurerm_log_analytics_workspace.main.id
  application_type    = "other"
  tags                = var.tags
}

resource "azurerm_log_analytics_workspace" "main" {
  name                = "${var.app_name}-logs"
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  sku                 = "PerGB2018"
  retention_in_days   = 30
  tags                = var.tags
}
