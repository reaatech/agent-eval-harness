terraform {
  required_version = ">= 1.0"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
  }
  backend "gcs" {
    bucket = "agent-eval-harness-tfstate-dev"
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

  service_name = "agent-eval-harness-dev"
  image_url    = var.image_url

  allow_unauthenticated = true

  max_instance_request_concurrency = 40
  max_instance_count               = 5
  min_instance_count               = 0

  cpu_limit    = "500m"
  memory_limit = "512Mi"

  environment_variables = {
    NODE_ENV         = "development"
    LOG_LEVEL        = "debug"
    JUDGE_MODEL      = var.judge_model
    EVAL_BUDGET      = "5.00"
    OTEL_EXPORTER    = "gcp"
    MCP_TRANSPORT    = "http"
  }

  secret_environment_variables = {
    anthropic_key = {
      name    = "ANTHROPIC_API_KEY"
      secret  = "agent-eval-harness-dev-antropic-key"
      version = "latest"
    }
    openai_key = {
      name    = "OPENAI_API_KEY"
      secret  = "agent-eval-harness-dev-openai-key"
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
