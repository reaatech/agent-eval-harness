variable "bucket_name" {
  description = "Name of the S3 bucket"
  type        = string
}

variable "enable_versioning" {
  description = "Enable bucket versioning"
  type        = bool
  default     = true
}

variable "block_public_access" {
  description = "Block all public access to the bucket"
  type        = bool
  default     = true
}

variable "kms_key_arn" {
  description = "ARN of KMS key for encryption (if not using AES256)"
  type        = string
  default     = ""
}

variable "lifecycle_rules" {
  description = "List of lifecycle rules"
  type = list(object({
    id                          = string
    status                      = optional(string)
    prefix                      = optional(string)
    expiration = optional(object({
      days = optional(number)
      date = optional(string)
    }))
    noncurrent_version_expiration = optional(object({
      noncurrent_days = number
    }))
    transition = optional(object({
      days          = optional(number)
      date          = optional(string)
      storage_class = string
    }))
    noncurrent_version_transition = optional(object({
      noncurrent_days = number
      storage_class   = string
    }))
  }))
  default = []
}

variable "bucket_policy" {
  description = "Bucket policy JSON document"
  type        = string
  default     = ""
}

variable "cors_rules" {
  description = "List of CORS rules"
  type = list(object({
    allowed_headers = optional(list(string))
    allowed_methods = list(string)
    allowed_origins = list(string)
    expose_headers  = optional(list(string))
    max_age_seconds = optional(number)
  }))
  default = []
}

variable "enable_metrics" {
  description = "Enable CloudWatch metrics for the bucket"
  type        = bool
  default     = false
}

variable "logging_target_bucket" {
  description = "Target bucket for access logging"
  type        = string
  default     = ""
}

variable "logging_target_prefix" {
  description = "Prefix for access log objects"
  type        = string
  default     = ""
}

variable "tags" {
  description = "Tags to apply to resources"
  type        = map(string)
  default     = {}
}
