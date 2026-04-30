terraform {
  required_version = ">= 1.0"
  required_providers {
    vercel = {
      source  = "vercel/vercel"
      version = "~> 1.0"
    }
  }
}

# Vercel Project
resource "vercel_project" "main" {
  name      = var.project_name
  framework = var.framework
  root_directory = var.root_directory

  git_repository = {
    type = "github"
    repo = var.repo
  }

  environment = [
    for key, value in var.environment_variables : {
      key    = key
      value  = value
      target = ["production", "preview"]
    }
  ]

  dynamic "environment" {
    for_each = var.secrets
    content {
      key        = environment.key
      value      = environment.value
      target     = ["production", "preview"]
      sensitive  = true
    }
  }
}

# Production Deployment
resource "vercel_deployment" "production" {
  project_id = vercel_project.main.id
  ref        = var.production_branch
  production = true
}

# Preview Deployment (for pull requests)
resource "vercel_deployment" "preview" {
  count      = var.enable_preview_deployments ? 1 : 0
  project_id = vercel_project.main.id
  ref        = var.preview_branch
  production = false
}

# Environment Variables (additional)
resource "vercel_project_environment_variable" "additional" {
  for_each = var.additional_env_vars

  project_id = vercel_project.main.id
  key        = each.key
  value      = each.value
  target     = each.value.target != null ? each.value.target : ["production", "preview"]
}

# Project Domain (custom domain)
resource "vercel_project_domain" "main" {
  count      = var.custom_domain != "" ? 1 : 0
  project_id = vercel_project.main.id
  domain     = var.custom_domain
}
