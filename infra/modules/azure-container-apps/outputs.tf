output "app_name" {
  description = "Name of the container app"
  value       = azurerm_container_app.main.name
}

output "app_id" {
  description = "ID of the container app"
  value       = azurerm_container_app.main.id
}

output "app_url" {
  description = "URL of the container app"
  value       = azurerm_container_app.main.ingress[0].fqdn
}

output "resource_group_name" {
  description = "Name of the resource group"
  value       = var.create_resource_group ? azurerm_resource_group.main[0].name : var.existing_resource_group_name
}

output "log_analytics_workspace_id" {
  description = "ID of the Log Analytics workspace"
  value       = azurerm_log_analytics_workspace.main.id
}

output "application_insights_instrumentation_key" {
  description = "Instrumentation key for Application Insights"
  value       = azurerm_application_insights.main.instrumentation_key
  sensitive   = true
}
