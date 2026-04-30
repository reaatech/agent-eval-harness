variable "project_name" {
  description = "Name of the Vercel project"
  type        = string
}

variable "framework" {
  description = "Framework preset (nextjs, nuxtjs, gatsby, etc.)"
  type        = string
  default     = "nextjs"
}

variable "root_directory" {
  description = "Root directory of the project"
  type        = string
  default     = ""
}

variable "repo" {
  description = "GitHub repository (owner/repo)"
  type        = string
}

variable "production_branch" {
  description = "Production branch"
  type        = string
  default     = "main"
}

variable "preview_branch" {
  description = "Preview branch (for PR deployments)"
  type        = string
  default     = "develop"
}

variable "enable_preview_deployments" {
  description = "Enable preview deployments for pull requests"
  type        = bool
  default     = true
}

variable "environment_variables" {
  description = "Environment variables"
  type        = map(string)
  default     = {}
}

variable "secrets" {
  description = "Secret environment variables"
  type        = map(string)
  default     = {}
  sensitive   = true
}

variable "additional_env_vars" {
  description = "Additional environment variables with target specification"
  type = map(object({
    value  = string
    target = optional(list(string))
  }))
  default = {}
}

variable "custom_domain" {
  description = "Custom domain"
  type        = string
  default     = ""
}
