terraform {
  required_version = ">= 1.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

# Secrets Manager Secret
resource "aws_secretsmanager_secret" "main" {
  name                    = var.secret_name
  description             = var.description
  kms_key_id              = var.kms_key_arn != "" ? var.kms_key_arn : null
  recovery_window_in_days = var.recovery_window_in_days
  tags                    = var.tags
}

# Secret Version (initial secret value)
resource "aws_secretsmanager_secret_version" "main" {
  count = var.secret_string != "" || length(var.secret_binary) > 0 ? 1 : 0

  secret_id = aws_secretsmanager_secret.main.id

  secret_string = var.secret_string != "" ? var.secret_string : null
  secret_binary = length(var.secret_binary) > 0 ? var.secret_binary : null
}

# Secret Policy (optional)
resource "aws_secretsmanager_secret_policy" "main" {
  count = var.policy != "" ? 1 : 0

  secret_arn = aws_secretsmanager_secret.main.arn
  policy     = var.policy
}

# Resource-based policy for cross-account access
resource "aws_secretsmanager_resource_policy" "main" {
  count = var.resource_policy != "" ? 1 : 0

  secret_arn = aws_secretsmanager_secret.main.arn
  policy     = var.resource_policy
}
