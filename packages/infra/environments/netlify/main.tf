terraform {
  required_version = ">= 1.0"
  required_providers {
    netlify = {
      source  = "netlify/netlify"
      version = "~> 2.0"
    }
  }
}

provider "netlify" {
  token = var.netlify_token
}

# Netlify Module
module "netlify" {
  source = "../../modules/netlify"

  site_name       = var.site_name
  account_slug    = var.account_slug
  environment     = var.environment
  custom_domain   = var.custom_domain
  force_ssl       = true
  css_minify      = true
  js_minify       = true
  pretty_urls     = true
  image_compress  = true
  build_dir       = var.build_dir
  functions_dir   = var.functions_dir
  node_version    = var.node_version
  build_env       = var.build_env
  secrets         = var.secrets
  custom_headers  = var.custom_headers
  redirects       = var.redirects
}

# Outputs
output "site_url" {
  value = module.netlify.site_url
}

output "admin_url" {
  value = module.netlify.admin_url
}

output "deploy_url" {
  value = module.netlify.deploy_url
}
