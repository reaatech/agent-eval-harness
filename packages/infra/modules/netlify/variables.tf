variable "site_name" {
  description = "Name of the Netlify site"
  type        = string
}

variable "account_slug" {
  description = "Account slug"
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

variable "force_ssl" {
  description = "Force HTTPS"
  type        = bool
  default     = true
}

variable "css_bundle" {
  description = "Bundle CSS files"
  type        = bool
  default     = false
}

variable "css_minify" {
  description = "Minify CSS files"
  type        = bool
  default     = true
}

variable "js_bundle" {
  description = "Bundle JS files"
  type        = bool
  default     = false
}

variable "js_minify" {
  description = "Minify JS files"
  type        = bool
  default     = true
}

variable "pretty_urls" {
  description = "Pretty URLs"
  type        = bool
  default     = true
}

variable "image_compress" {
  description = "Compress images"
  type        = bool
  default     = true
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
