terraform {
  required_version = ">= 1.0"
  required_providers {
    vercel = {
      source  = "vercel/vercel"
      version = "~> 1.0"
    }
  }
}

provider "vercel" {
  api_token = var.vercel_token
}

# Vercel Module
module "vercel" {
  source = "../../modules/vercel"

  project_name                 = var.project_name
  framework                    = var.framework
  root_directory               = var.root_directory
  repo                         = var.repo
  production_branch            = var.production_branch
  preview_branch               = var.preview_branch
  enable_preview_deployments   = var.enable_preview_deployments
  environment_variables        = var.environment_variables
  secrets                      = var.secrets
  additional_env_vars          = var.additional_env_vars
  custom_domain                = var.custom_domain
}

# Outputs
output "project_id" {
  value = module.vercel.project_id
}

output "production_url" {
  value = module.vercel.production_url
}

output "preview_url" {
  value = module.vercel.preview_url
}
