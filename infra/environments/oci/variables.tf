variable "region" {
  description = "OCI region"
  type        = string
}

variable "compartment_id" {
  description = "OCI compartment ID"
  type        = string
}

variable "tenancy_ocid" {
  description = "OCI tenancy OCID"
  type        = string
}

variable "user_ocid" {
  description = "OCI user OCID"
  type        = string
}

variable "fingerprint" {
  description = "API signing certificate fingerprint"
  type        = string
}

variable "private_key_path" {
  description = "Path to API signing private key"
  type        = string
}

variable "private_key_password" {
  description = "Private key password"
  type        = string
  default     = null
  sensitive   = true
}

variable "app_name" {
  description = "Application name"
  type        = string
}

variable "cluster_name" {
  description = "OKE cluster name"
  type        = string
}

variable "kubernetes_version" {
  description = "Kubernetes version"
  type        = string
  default     = "v1.28.0"
}

variable "vcn_cidr" {
  description = "VCN CIDR block"
  type        = string
  default     = "10.0.0.0/16"
}

variable "public_subnet_cidr" {
  description = "Public subnet CIDR"
  type        = string
  default     = "10.0.0.0/24"
}

variable "private_subnet_cidr" {
  description = "Private subnet CIDR"
  type        = string
  default     = "10.0.1.0/24"
}

variable "node_shape" {
  description = "Node shape"
  type        = string
  default     = "VM.Standard.E4.Flex"
}

variable "node_memory_in_gbs" {
  description = "Node memory in GB"
  type        = number
  default     = 16
}

variable "node_ocpus" {
  description = "Node OCPUs"
  type        = number
  default     = 2
}

variable "node_os" {
  description = "Node operating system"
  type        = string
  default     = "Oracle-Linux-8.8"
}

variable "node_os_version" {
  description = "Node OS version"
  type        = string
  default     = "8.8"
}

variable "ssh_public_key" {
  description = "SSH public key for nodes"
  type        = string
}

variable "node_pool_size" {
  description = "Number of nodes"
  type        = number
  default     = 3
}

variable "image_url" {
  description = "Docker image URL"
  type        = string
}

variable "image_tag" {
  description = "Docker image tag"
  type        = string
  default     = "latest"
}

variable "replicas" {
  description = "Number of replicas"
  type        = number
  default     = 2
}
