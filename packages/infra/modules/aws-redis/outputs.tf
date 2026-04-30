output "replication_group_id" {
  description = "ID of the ElastiCache replication group"
  value       = var.cluster_mode_enabled ? aws_elasticache_replication_group.cluster[0].id : aws_elasticache_replication_group.main[0].id
}

output "replication_group_arn" {
  description = "ARN of the ElastiCache replication group"
  value       = var.cluster_mode_enabled ? aws_elasticache_replication_group.cluster[0].arn : aws_elasticache_replication_group.main[0].arn
}

output "configuration_endpoint_address" {
  description = "Configuration endpoint address"
  value       = var.cluster_mode_enabled ? aws_elasticache_replication_group.cluster[0].configuration_endpoint_address : aws_elasticache_replication_group.main[0].configuration_endpoint_address
}

output "primary_endpoint_address" {
  description = "Primary endpoint address"
  value       = var.cluster_mode_enabled ? aws_elasticache_replication_group.cluster[0].primary_endpoint_address : aws_elasticache_replication_group.main[0].primary_endpoint_address
}

output "reader_endpoint_address" {
  description = "Reader endpoint address"
  value       = var.cluster_mode_enabled ? aws_elasticache_replication_group.cluster[0].reader_endpoint_address : aws_elasticache_replication_group.main[0].reader_endpoint_address
}

output "port" {
  description = "Port number"
  value       = var.cluster_mode_enabled ? aws_elasticache_replication_group.cluster[0].port : aws_elasticache_replication_group.main[0].port
}

output "subnet_group_name" {
  description = "Name of the subnet group"
  value       = aws_elasticache_subnet_group.main.name
}

output "parameter_group_name" {
  description = "Name of the parameter group"
  value       = var.create_parameter_group ? aws_elasticache_parameter_group.main[0].name : var.existing_parameter_group
}
