variable "db_name" {
  description = "Name of the database"
  type        = string
}

variable "username" {
  description = "Master username"
  type        = string
  sensitive   = true
}

variable "password" {
  description = "Master password"
  type        = string
  sensitive   = true
}

variable "engine_version" {
  description = "PostgreSQL engine version (e.g., 14, 15)"
  type        = string
  default     = "15"
}

variable "instance_class" {
  description = "Instance class (e.g., db.t3.micro, db.t3.small)"
  type        = string
  default     = "db.t3.micro"
}

variable "allocated_storage" {
  description = "Initial allocated storage in GB"
  type        = number
  default     = 20
}

variable "max_allocated_storage" {
  description = "Maximum allocated storage in GB (autoscaling)"
  type        = number
  default     = 100
}

variable "storage_encrypted" {
  description = "Whether to encrypt storage"
  type        = bool
  default     = true
}

variable "kms_key_arn" {
  description = "ARN of KMS key for encryption"
  type        = string
  default     = ""
}

variable "subnet_ids" {
  description = "List of subnet IDs for the DB subnet group"
  type        = list(string)
}

variable "security_group_ids" {
  description = "List of security group IDs"
  type        = list(string)
}

variable "multi_az" {
  description = "Whether to deploy in multiple AZs"
  type        = bool
  default     = false
}

variable "backup_retention_period" {
  description = "Number of days to retain backups"
  type        = number
  default     = 7
}

variable "backup_window" {
  description = "Preferred backup window"
  type        = string
  default     = "03:00-04:00"
}

variable "maintenance_window" {
  description = "Preferred maintenance window"
  type        = string
  default     = "Mon:04:00-Mon:05:00"
}

variable "skip_final_snapshot" {
  description = "Whether to skip final snapshot on deletion"
  type        = bool
  default     = true
}

variable "delete_automated_backups" {
  description = "Whether to delete automated backups on deletion"
  type        = bool
  default     = true
}

variable "enable_cloudwatch_logs_exports" {
  description = "List of log types to export to CloudWatch"
  type        = list(string)
  default     = ["postgresql"]
}

variable "log_retention_days" {
  description = "CloudWatch log retention in days"
  type        = number
  default     = 30
}

variable "enable_performance_insights" {
  description = "Whether to enable Performance Insights"
  type        = bool
  default     = false
}

variable "enable_enhanced_monitoring" {
  description = "Whether to enable enhanced monitoring"
  type        = bool
  default     = false
}

variable "auto_minor_version_upgrade" {
  description = "Whether to enable auto minor version upgrades"
  type        = bool
  default     = true
}

variable "deletion_protection" {
  description = "Whether to enable deletion protection"
  type        = bool
  default     = false
}

variable "create_parameter_group" {
  description = "Whether to create a new parameter group"
  type        = bool
  default     = true
}

variable "existing_parameter_group" {
  description = "Name of existing parameter group (if create_parameter_group is false)"
  type        = string
  default     = ""
}

variable "create_option_group" {
  description = "Whether to create a new option group"
  type        = bool
  default     = true
}

variable "existing_option_group" {
  description = "Name of existing option group (if create_option_group is false)"
  type        = string
  default     = ""
}

variable "parameter_overrides" {
  description = "List of parameter overrides for the parameter group"
  type = list(object({
    name         = string
    value        = string
    apply_method = optional(string)
  }))
  default = []
}

variable "tags" {
  description = "Tags to apply to resources"
  type        = map(string)
  default     = {}
}
