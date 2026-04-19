variable "vercel_token" {
  description = "Vercel API token"
  type        = string
  sensitive   = true
}

variable "project_name" {
  description = "Name of the Vercel project"
  type        = string
}

variable "framework" {
  description = "Framework preset"
  type        = string
  default     = "nextjs"
}

variable "root_directory" {
  description = "Root directory"
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
  description = "Preview branch"
  type        = string
  default     = "develop"
}

variable "enable_preview_deployments" {
  description = "Enable preview deployments"
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
  description = "Additional environment variables"
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
