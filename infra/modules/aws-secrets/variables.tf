variable "secret_name" {
  description = "Name of the secret"
  type        = string
}

variable "description" {
  description = "Description of the secret"
  type        = string
  default     = ""
}

variable "secret_string" {
  description = "Initial secret value as a JSON string"
  type        = string
  default     = ""
  sensitive   = true
}

variable "secret_binary" {
  description = "Initial secret value as binary data"
  type        = string
  default     = ""
  sensitive   = true
}

variable "kms_key_arn" {
  description = "ARN of KMS key for encryption (if not using default)"
  type        = string
  default     = ""
}

variable "recovery_window_in_days" {
  description = "Number of days to retain the secret before deletion (0-30, or null for immediate deletion)"
  type        = number
  default     = 30
}

variable "policy" {
  description = "Resource-based policy JSON document attached to the secret"
  type        = string
  default     = ""
}

variable "resource_policy" {
  description = "Resource policy for cross-account access"
  type        = string
  default     = ""
}

variable "tags" {
  description = "Tags to apply to resources"
  type        = map(string)
  default     = {}
}
