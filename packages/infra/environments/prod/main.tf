terraform {
  required_version = ">= 1.0"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
  }
  backend "gcs" {
    bucket = "agent-eval-harness-tfstate-prod"
    prefix = "terraform/state"
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}

module "cloud_run" {
  source = "../../modules/cloud-run"

  project_id = var.project_id
  region     = var.region

  service_name = "agent-eval-harness-prod"
  image_url    = var.image_url

  allow_unauthenticated = false

  max_instance_request_concurrency = 100
  max_instance_count               = 20
  min_instance_count               = 1

  cpu_limit    = "2000m"
  memory_limit = "1Gi"

  environment_variables = {
    NODE_ENV         = "production"
    LOG_LEVEL        = "info"
    JUDGE_MODEL      = var.judge_model
    EVAL_BUDGET      = "50.00"
    OTEL_EXPORTER    = "gcp"
    MCP_TRANSPORT    = "http"
  }

  secret_environment_variables = {
    anthropic_key = {
      name    = "ANTHROPIC_API_KEY"
      secret  = "agent-eval-harness-prod-antropic-key"
      version = "latest"
    }
    openai_key = {
      name    = "OPENAI_API_KEY"
      secret  = "agent-eval-harness-prod-openai-key"
      version = "latest"
    }
    google_key = {
      name    = "GOOGLE_API_KEY"
      secret  = "agent-eval-harness-prod-google-key"
      version = "latest"
    }
  }
}

output "service_url" {
  value = module.cloud_run.service_url
}

output "service_name" {
  value = module.cloud_run.service_name
}

output "service_account" {
  value = module.cloud_run.service_account_email
}
