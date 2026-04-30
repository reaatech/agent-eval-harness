variable "cluster_id" {
  description = "Identifier for the ElastiCache cluster"
  type        = string
}

variable "description" {
  description = "Description of the ElastiCache replication group"
  type        = string
  default     = ""
}

variable "engine_version" {
  description = "Redis engine version (e.g., 7.1, 7.0, 6.2)"
  type        = string
  default     = "7.1"
}

variable "node_type" {
  description = "Instance type (e.g., cache.t3.micro, cache.r6g.large)"
  type        = string
  default     = "cache.t3.micro"
}

variable "num_cache_nodes" {
  description = "Number of cache nodes (for non-clustered mode)"
  type        = number
  default     = 1
}

variable "num_node_groups" {
  description = "Number of node groups (for clustered mode)"
  type        = number
  default     = 1
}

variable "replicas_per_node_group" {
  description = "Number of replicas per node group"
  type        = number
  default     = 0
}

variable "automatic_failover_enabled" {
  description = "Whether to enable automatic failover"
  type        = bool
  default     = false
}

variable "multi_az_enabled" {
  description = "Whether to enable Multi-AZ"
  type        = bool
  default     = false
}

variable "cluster_mode_enabled" {
  description = "Whether to enable cluster mode (sharding)"
  type        = bool
  default     = false
}

variable "subnet_ids" {
  description = "List of subnet IDs for the subnet group"
  type        = list(string)
}

variable "security_group_ids" {
  description = "List of security group IDs"
  type        = list(string)
}

variable "ip_discovery" {
  description = "IP discovery type (ipv4 or ipv6)"
  type        = string
  default     = "ipv4"
}

variable "network_type" {
  description = "Network type (ipv4 or dual_stack)"
  type        = string
  default     = "ipv4"
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

variable "parameter_overrides" {
  description = "List of parameter overrides"
  type = list(object({
    name  = string
    value = string
  }))
  default = []
}

variable "at_rest_encryption_enabled" {
  description = "Whether to enable encryption at rest"
  type        = bool
  default     = true
}

variable "transit_encryption_enabled" {
  description = "Whether to enable encryption in transit"
  type        = bool
  default     = true
}

variable "kms_key_arn" {
  description = "ARN of KMS key for encryption"
  type        = string
  default     = ""
}

variable "auth_token" {
  description = "Auth token for Redis AUTH"
  type        = string
  default     = ""
  sensitive   = true
}

variable "auth_token_update_strategy" {
  description = "Strategy for updating auth token (SET, DELETE, ROTATE)"
  type        = string
  default     = "SET"
}

variable "maintenance_window" {
  description = "Preferred maintenance window"
  type        = string
  default     = "mon:03:00-mon:04:00"
}

variable "snapshot_window" {
  description = "Daily time range for taking snapshots"
  type        = string
  default     = "03:00-04:00"
}

variable "snapshot_retention_limit" {
  description = "Number of days to retain snapshots"
  type        = number
  default     = 0
}

variable "snapshot_name" {
  description = "Name of a snapshot from which to restore data"
  type        = string
  default     = ""
}

variable "notification_topic_arn" {
  description = "ARN of SNS topic for notifications"
  type        = string
  default     = ""
}

variable "tags" {
  description = "Tags to apply to resources"
  type        = map(string)
  default     = {}
}
