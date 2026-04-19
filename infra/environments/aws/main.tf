terraform {
  required_version = ">= 1.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
  backend "s3" {
    bucket = "agent-eval-harness-tfstate-aws"
    key    = "terraform/state/terraform.tfstate"
    region = "us-east-1"
  }
}

provider "aws" {
  region = var.region
  default_tags {
    tags = {
      Environment = var.environment
      ManagedBy   = "terraform"
      Project     = "agent-eval-harness"
    }
  }
}

data "aws_caller_identity" "current" {}

data "aws_vpc" "main" {
  id = var.vpc_id
}

data "aws_subnets" "private" {
  filter {
    name   = "vpc-id"
    values = [var.vpc_id]
  }
  filter {
    name   = "tag:Type"
    values = ["private"]
  }
}

data "aws_subnets" "public" {
  filter {
    name   = "vpc-id"
    values = [var.vpc_id]
  }
  filter {
    name   = "tag:Type"
    values = ["public"]
  }
}

# Security Groups
resource "aws_security_group" "ecs" {
  name        = "${var.service_name}-ecs-sg"
  description = "Security group for ECS tasks"
  vpc_id      = var.vpc_id

  ingress {
    description = "Allow inbound traffic from ALB"
    from_port   = 8080
    to_port     = 8080
    protocol    = "tcp"
    cidr_blocks = [data.aws_vpc.main.cidr_block]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${var.service_name}-ecs-sg"
  }
}

resource "aws_security_group" "rds" {
  name        = "${var.service_name}-rds-sg"
  description = "Security group for RDS"
  vpc_id      = var.vpc_id

  ingress {
    description     = "Allow inbound traffic from ECS"
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.ecs.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${var.service_name}-rds-sg"
  }
}

resource "aws_security_group" "redis" {
  name        = "${var.service_name}-redis-sg"
  description = "Security group for Redis"
  vpc_id      = var.vpc_id

  ingress {
    description     = "Allow inbound traffic from ECS"
    from_port       = 6379
    to_port         = 6379
    protocol        = "tcp"
    security_groups = [aws_security_group.ecs.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${var.service_name}-redis-sg"
  }
}

# Secrets Manager - Database credentials
resource "aws_secretsmanager_secret" "db_credentials" {
  name = "${var.service_name}-${var.environment}-db-credentials"
}

resource "aws_secretsmanager_secret_version" "db_credentials" {
  secret_id = aws_secretsmanager_secret.db_credentials.id
  secret_string = jsonencode({
    username = var.db_username
    password = var.db_password
  })
}

# RDS PostgreSQL
module "rds" {
  source = "../../modules/aws-rds"

  db_name      = var.db_name
  username     = var.db_username
  password     = var.db_password
  engine_version = var.db_engine_version
  instance_class = var.db_instance_class

  subnet_ids         = data.aws_subnets.private.ids
  security_group_ids = [aws_security_group.rds.id]

  multi_az                = var.environment == "production"
  backup_retention_period = var.environment == "production" ? 14 : 7
  skip_final_snapshot     = var.environment != "production"

  enable_performance_insights = var.environment == "production"
  enable_enhanced_monitoring  = var.environment == "production"

  tags = {
    Name = "${var.service_name}-db"
  }
}

# ElastiCache Redis
module "redis" {
  source = "../../modules/aws-redis"

  cluster_id     = "${var.service_name}-${var.environment}-redis"
  engine_version = var.redis_engine_version
  node_type      = var.redis_node_type

  num_cache_nodes = 1

  subnet_ids         = data.aws_subnets.private.ids
  security_group_ids = [aws_security_group.redis.id]

  at_rest_encryption_enabled = true
  transit_encryption_enabled = true

  tags = {
    Name = "${var.service_name}-redis"
  }
}

# S3 Buckets
module "storage" {
  source = "../../modules/aws-s3"

  bucket_name       = "${var.service_name}-${var.environment}-storage-${data.aws_caller_identity.current.account_id}"
  enable_versioning = true

  lifecycle_rules = var.environment == "production" ? [
    {
      id     = "expire-old-objects"
      status = "Enabled"
      expiration = {
        days = 90
      }
    }
  ] : []

  tags = {
    Name = "${var.service_name}-storage"
  }
}

# ECS Fargate
module "ecs" {
  source = "../../modules/aws-ecs"

  service_name = var.service_name
  region       = var.region
  image_url    = var.image_url

  cpu       = var.ecs_cpu
  memory    = var.ecs_memory
  desired_count = var.ecs_desired_count

  subnet_ids         = data.aws_subnets.private.ids
  security_group_ids = [aws_security_group.ecs.id]

  create_cluster = true

  enable_autoscaling = var.environment == "production"
  min_capacity       = var.environment == "production" ? 2 : 0
  max_capacity       = var.environment == "production" ? 10 : 4
  cpu_target_value   = 70

  enable_health_check = true
  enable_secrets      = true

  secret_arns = [
    aws_secretsmanager_secret.db_credentials.arn,
    module.rds.cloudwatch_log_group_arn
  ]

  secrets = [
    {
      name = "DB_HOST"
      arn  = "${module.rds.db_instance_endpoint}:postgresql"
    },
    {
      name = "REDIS_HOST"
      arn  = "${module.redis.primary_endpoint_address}:postgresql"
    }
  ]

  environment_variables = {
    NODE_ENV         = var.environment
    LOG_LEVEL        = var.environment == "production" ? "info" : "debug"
    DATABASE_URL     = "postgres://${var.db_username}:${var.db_password}@${module.rds.db_instance_endpoint}/${var.db_name}"
    REDIS_URL        = "redis://${module.redis.primary_endpoint_address}:6379"
    S3_BUCKET        = module.storage.bucket_name
    OTEL_EXPORTER    = "otlp"
    OTEL_ENDPOINT    = var.otel_endpoint
    MCP_TRANSPORT    = "http"
  }

  tags = {
    Name = var.service_name
  }
}

# Outputs
output "ecs_cluster_name" {
  value = module.ecs.cluster_name
}

output "ecs_service_name" {
  value = module.ecs.service_name
}

output "ecs_service_arn" {
  value = module.ecs.service_arn
}

output "rds_endpoint" {
  value = module.rds.db_instance_endpoint
}

output "redis_endpoint" {
  value = module.redis.primary_endpoint_address
}

output "s3_bucket_name" {
  value = module.storage.bucket_name
}
