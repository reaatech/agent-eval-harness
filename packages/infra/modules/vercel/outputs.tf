output "project_id" {
  description = "ID of the Vercel project"
  value       = vercel_project.main.id
}

output "project_name" {
  description = "Name of the Vercel project"
  value       = vercel_project.main.name
}

output "production_url" {
  description = "Production deployment URL"
  value       = vercel_deployment.production.url
}

output "preview_url" {
  description = "Preview deployment URL (if enabled)"
  value       = var.enable_preview_deployments ? vercel_deployment.preview[0].url : null
}

output "custom_domain" {
  description = "Custom domain (if configured)"
  value       = var.custom_domain != "" ? vercel_project_domain.main[0].domain : null
}
