variable "netlify_token" {
  description = "Netlify API token"
  type        = string
  sensitive   = true
}

variable "site_name" {
  description = "Name of the Netlify site"
  type        = string
}

variable "account_slug" {
  description = "Netlify account slug"
  type        = string
}

variable "environment" {
  description = "Environment name"
  type        = string
  default     = "production"
}

variable "custom_domain" {
  description = "Custom domain"
  type        = string
  default     = ""
}

variable "build_dir" {
  description = "Build directory"
  type        = string
  default     = "dist"
}

variable "functions_dir" {
  description = "Functions directory"
  type        = string
  default     = "functions"
}

variable "node_version" {
  description = "Node.js version"
  type        = string
  default     = "22"
}

variable "build_env" {
  description = "Build environment variables"
  type        = map(string)
  default     = {}
}

variable "secrets" {
  description = "Secret environment variables"
  type        = map(string)
  default     = {}
  sensitive   = true
}

variable "custom_headers" {
  description = "Custom headers"
  type        = list(map(string))
  default     = []
}

variable "redirects" {
  description = "Redirect rules"
  type        = list(map(string))
  default     = []
}
