terraform {
  required_version = ">= 1.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

# Subnet Group
resource "aws_elasticache_subnet_group" "main" {
  name       = "${var.cluster_id}-subnet-group"
  subnet_ids = var.subnet_ids
  tags       = var.tags
}

# Parameter Group
resource "aws_elasticache_parameter_group" "main" {
  count = var.create_parameter_group ? 1 : 0

  family = "redis${var.engine_version}"
  name   = "${var.cluster_id}-param-group"

  dynamic "parameter" {
    for_each = var.parameter_overrides
    content {
      name  = parameter.value.name
      value = parameter.value.value
    }
  }

  tags = var.tags
}

# KMS Key for encryption (uses default if not provided)
data "aws_kms_key" "redis" {
  count = var.kms_key_arn != "" ? 0 : 1

  key_id = "alias/aws/elasticache"
}

# ElastiCache Replication Group (Cluster mode disabled - single node or replica)
resource "aws_elasticache_replication_group" "main" {
  count = var.cluster_mode_enabled ? 0 : 1

  replication_group_id          = var.cluster_id
  description                   = var.description
  engine                        = "redis"
  engine_version                = var.engine_version
  node_type                     = var.node_type
  num_cache_nodes               = var.num_cache_nodes
  num_node_groups               = 1
  replicas_per_node_group       = var.replicas_per_node_group
  automatic_failover_enabled    = var.automatic_failover_enabled
  multi_az_enabled              = var.multi_az_enabled

  # Network
  subnet_group_name   = aws_elasticache_subnet_group.main.name
  security_group_ids  = var.security_group_ids
  ip_discovery        = var.ip_discovery
  network_type        = var.network_type

  # Parameter group
  parameter_group_name = var.create_parameter_group ? aws_elasticache_parameter_group.main[0].name : var.existing_parameter_group

  # Security
  at_rest_encryption_enabled = var.at_rest_encryption_enabled
  transit_encryption_enabled = var.transit_encryption_enabled
  kms_key_id                 = var.kms_key_arn != "" ? var.kms_key_arn : data.aws_kms_key.redis[0].arn
  auth_token                 = var.auth_token
  auth_token_update_strategy = var.auth_token_update_strategy

  # Maintenance
  maintenance_window       = var.maintenance_window
  snapshot_window          = var.snapshot_window
  snapshot_retention_limit = var.snapshot_retention_limit
  snapshot_name            = var.snapshot_name

  # Notifications
  notification_topic_arn = var.notification_topic_arn
  notification_topic_arns = var.notification_topic_arn != "" ? [var.notification_topic_arn] : null

  # Tags
  tags = var.tags

  lifecycle {
    ignore_changes = [num_cache_nodes]
  }
}

# ElastiCache Replication Group (Cluster mode enabled)
resource "aws_elasticache_replication_group" "cluster" {
  count = var.cluster_mode_enabled ? 1 : 0

  replication_group_id          = var.cluster_id
  description                   = var.description
  engine                        = "redis"
  engine_version                = var.engine_version
  node_type                     = var.node_type
  num_node_groups               = var.num_node_groups
  replicas_per_node_group       = var.replicas_per_node_group
  automatic_failover_enabled    = var.automatic_failover_enabled
  multi_az_enabled              = var.multi_az_enabled

  # Network
  subnet_group_name   = aws_elasticache_subnet_group.main.name
  security_group_ids  = var.security_group_ids
  ip_discovery        = var.ip_discovery
  network_type        = var.network_type

  # Parameter group
  parameter_group_name = var.create_parameter_group ? aws_elasticache_parameter_group.main[0].name : var.existing_parameter_group

  # Security
  at_rest_encryption_enabled = var.at_rest_encryption_enabled
  transit_encryption_enabled = var.transit_encryption_enabled
  kms_key_id                 = var.kms_key_arn != "" ? var.kms_key_arn : data.aws_kms_key.redis[0].arn
  auth_token                 = var.auth_token
  auth_token_update_strategy = var.auth_token_update_strategy

  # Maintenance
  maintenance_window       = var.maintenance_window
  snapshot_window          = var.snapshot_window
  snapshot_retention_limit = var.snapshot_retention_limit
  snapshot_name            = var.snapshot_name

  # Notifications
  notification_topic_arn = var.notification_topic_arn
  notification_topic_arns = var.notification_topic_arn != "" ? [var.notification_topic_arn] : null

  # Tags
  tags = var.tags
}
