# Azure environment configuration

resource_group_name = "agent-eval-harness-rg"
location            = "eastus"
app_name            = "agent-eval-harness"
environment         = "production"

# Container Apps
image_url      = "agent-eval-harness.azurecr.io/agent-eval-harness:latest"
cpu            = 0.5
memory         = 1
min_replicas   = 0
max_replicas   = 10

# PostgreSQL
db_sku            = "GP_Gen5_2"
db_version        = "14"
db_admin_username = "azureadmin"
db_storage_mb     = 32768

# Redis
redis_capacity  = 1
redis_family    = "C"
redis_sku_name  = "Basic"

# State storage
storage_resource_group = "agent-eval-harness-tfstate-rg"
storage_account_name   = "agentevalharnesstfstate"

tags = {
  Environment = "production"
  Project     = "agent-eval-harness"
  ManagedBy   = "terraform"
}
