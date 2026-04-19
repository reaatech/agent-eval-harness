terraform {
  required_version = ">= 1.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

# CloudWatch Log Group for RDS
resource "aws_cloudwatch_log_group" "main" {
  name              = "/aws/rds/${var.db_name}"
  retention_in_days = var.log_retention_days
}

# Subnet Group
resource "aws_db_subnet_group" "main" {
  name       = "${var.db_name}-subnet-group"
  subnet_ids = var.subnet_ids
  tags = merge(var.tags, {
    Name = "${var.db_name}-subnet-group"
  })
}

# Option Group
resource "aws_db_option_group" "main" {
  count = var.create_option_group ? 1 : 0

  name                     = "${var.db_name}-option-group"
  option_group_description = "Option group for ${var.db_name}"
  engine_name              = "postgres"
  major_engine_version     = var.engine_version

  tags = var.tags
}

# Parameter Group
resource "aws_db_parameter_group" "main" {
  count = var.create_parameter_group ? 1 : 0

  name   = "${var.db_name}-param-group"
  family = "postgres${var.engine_version}"

  dynamic "parameter" {
    for_each = var.parameter_overrides
    content {
      name         = parameter.value.name
      value        = parameter.value.value
      apply_method = lookup(parameter.value, "apply_method", null)
    }
  }

  tags = var.tags
}

# KMS Key for encryption (optional - uses default if not provided)
data "aws_kms_key" "rds" {
  count = var.kms_key_arn != "" ? 0 : 1

  key_id = "alias/aws/rds"
}

# RDS Instance
resource "aws_db_instance" "main" {
  identifier = var.db_name

  # Engine
  engine               = "postgres"
  engine_version       = var.engine_version
  instance_class       = var.instance_class
  allocated_storage    = var.allocated_storage
  max_allocated_storage = var.max_allocated_storage
  storage_type         = "gp3"
  storage_encrypted    = var.storage_encrypted
  kms_key_id           = var.kms_key_arn != "" ? var.kms_key_arn : data.aws_kms_key.rds[0].arn

  # Database
  db_name  = var.db_name
  username = var.username
  password = var.password
  port     = 5432

  # Network
  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = var.security_group_ids
  publicly_accessible    = false
  multi_az               = var.multi_az

  # Parameter and option groups
  parameter_group_name = var.create_parameter_group ? aws_db_parameter_group.main[0].name : var.existing_parameter_group
  option_group_name    = var.create_option_group ? aws_db_option_group.main[0].name : var.existing_option_group

  # Backup
  backup_retention_period = var.backup_retention_period
  backup_window          = var.backup_window
  maintenance_window     = var.maintenance_window
  copy_tags_to_snapshot  = true
  delete_automated_backups = var.delete_automated_backups
  skip_final_snapshot      = var.skip_final_snapshot
  final_snapshot_identifier = var.skip_final_snapshot ? null : "${var.db_name}-final-snapshot"

  # Monitoring
  enabled_cloudwatch_logs_exports = var.enable_cloudwatch_logs_exports
  cloudwatch_log_group_kms_key_id = var.kms_key_arn != "" ? var.kms_key_arn : null
  performance_insights_enabled    = var.enable_performance_insights
  performance_insights_retention_period = var.enable_performance_insights ? 7 : null
  monitoring_interval             = var.enable_enhanced_monitoring ? 60 : 0
  monitoring_role_arn             = var.enable_enhanced_monitoring ? aws_iam_role.monitoring[0].arn : null

  # Auto minor version upgrade
  auto_minor_version_upgrade = var.auto_minor_version_upgrade

  # Deletion protection
  deletion_protection = var.deletion_protection

  # Tags
  tags = var.tags

  lifecycle {
    prevent_destroy = false
  }
}

# IAM Role for enhanced monitoring
resource "aws_iam_role" "monitoring" {
  count = var.enable_enhanced_monitoring ? 1 : 0

  name = "${var.db_name}-monitoring-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "monitoring.rds.amazonaws.com"
        }
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "monitoring" {
  count = var.enable_enhanced_monitoring ? 1 : 0

  role       = aws_iam_role.monitoring[0].name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonRDSEnhancedMonitoringRole"
}
