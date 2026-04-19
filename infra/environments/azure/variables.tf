variable "resource_group_name" {
  description = "Name of the resource group"
  type        = string
}

variable "location" {
  description = "Azure region"
  type        = string
  default     = "eastus"
}

variable "app_name" {
  description = "Application name"
  type        = string
}

variable "environment" {
  description = "Environment name"
  type        = string
  default     = "production"
}

variable "image_url" {
  description = "Docker image URL"
  type        = string
}

variable "cpu" {
  description = "CPU cores"
  type        = number
  default     = 0.5
}

variable "memory" {
  description = "Memory in GB"
  type        = number
  default     = 1
}

variable "min_replicas" {
  description = "Minimum replicas"
  type        = number
  default     = 0
}

variable "max_replicas" {
  description = "Maximum replicas"
  type        = number
  default     = 10
}

variable "environment_variables" {
  description = "Environment variables"
  type        = map(string)
  default     = {}
}

variable "db_sku" {
  description = "PostgreSQL SKU"
  type        = string
  default     = "GP_Gen5_2"
}

variable "db_version" {
  description = "PostgreSQL version"
  type        = string
  default     = "14"
}

variable "db_admin_username" {
  description = "PostgreSQL admin username"
  type        = string
}

variable "db_admin_password" {
  description = "PostgreSQL admin password"
  type        = string
  sensitive   = true
}

variable "db_storage_mb" {
  description = "PostgreSQL storage in MB"
  type        = number
  default     = 32768
}

variable "redis_capacity" {
  description = "Redis capacity"
  type        = number
  default     = 1
}

variable "redis_family" {
  description = "Redis family"
  type        = string
  default     = "C"
}

variable "redis_sku_name" {
  description = "Redis SKU name"
  type        = string
  default     = "Basic"
}

variable "storage_resource_group" {
  description = "Resource group for state storage"
  type        = string
}

variable "storage_account_name" {
  description = "Storage account name for state"
  type        = string
}

variable "tags" {
  description = "Tags"
  type        = map(string)
  default     = {}
}
