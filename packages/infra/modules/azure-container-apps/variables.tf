variable "app_name" {
  description = "Name of the container app"
  type        = string
}

variable "location" {
  description = "Azure region"
  type        = string
}

variable "environment" {
  description = "Environment name (development, staging, production)"
  type        = string
}

variable "image_url" {
  description = "Docker image URL"
  type        = string
}

variable "cpu" {
  description = "CPU cores (0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2)"
  type        = number
  default     = 0.5
}

variable "memory" {
  description = "Memory in GB (0.5, 1, 1.5, 2, 3, 3.5, 4)"
  type        = number
  default     = 1
}

variable "min_replicas" {
  description = "Minimum number of replicas"
  type        = number
  default     = 0
}

variable "max_replicas" {
  description = "Maximum number of replicas"
  type        = number
  default     = 10
}

variable "create_resource_group" {
  description = "Whether to create a new resource group"
  type        = bool
  default     = true
}

variable "resource_group_name" {
  description = "Name of resource group (if creating new)"
  type        = string
  default     = ""
}

variable "existing_resource_group_name" {
  description = "Name of existing resource group"
  type        = string
  default     = ""
}

variable "subnet_id" {
  description = "Subnet ID for the Container Apps environment"
  type        = string
}

variable "environment_variables" {
  description = "Map of environment variables"
  type        = map(string)
  default     = {}
}

variable "secrets" {
  description = "Map of secrets from Key Vault"
  type = map(object({
    name                  = string
    key_vault_secret_id   = string
  }))
  default = {}
}

variable "tags" {
  description = "Tags to apply to resources"
  type        = map(string)
  default     = {}
}
