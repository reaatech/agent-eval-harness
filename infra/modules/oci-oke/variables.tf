variable "compartment_id" {
  description = "OCI compartment ID"
  type        = string
}

variable "cluster_name" {
  description = "Name of the OKE cluster"
  type        = string
}

variable "vcn_id" {
  description = "VCN ID"
  type        = string
}

variable "kubernetes_version" {
  description = "Kubernetes version"
  type        = string
  default     = "v1.28.0"
}

variable "is_public" {
  description = "Whether the cluster endpoint is public"
  type        = bool
  default     = true
}

variable "cluster_endpoint_subnet_id" {
  description = "Subnet ID for cluster endpoint"
  type        = string
}

variable "service_lb_subnet_ids" {
  description = "Subnet IDs for service load balancer"
  type        = list(string)
}

variable "nsg_ids" {
  description = "Network security group IDs"
  type        = list(string)
  default     = []
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

variable "node_image_id" {
  description = "Node image ID"
  type        = string
}

variable "ssh_public_key" {
  description = "SSH public key for nodes"
  type        = string
}

variable "node_pool_subnet_ids" {
  description = "Subnet IDs for node pool"
  type        = list(string)
}

variable "availability_domain" {
  description = "Availability domain"
  type        = string
}

variable "node_pool_size" {
  description = "Number of nodes in the pool"
  type        = number
  default     = 3
}

variable "create_cluster" {
  description = "Whether to create a new cluster"
  type        = bool
  default     = true
}

variable "app_name" {
  description = "Name of the application"
  type        = string
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

variable "namespace" {
  description = "Kubernetes namespace"
  type        = string
  default     = "default"
}

variable "helm_repository" {
  description = "Helm chart repository"
  type        = string
  default     = "https://charts.bitnami.com/bitnami"
}

variable "helm_chart" {
  description = "Helm chart name"
  type        = string
  default     = "agent-eval-harness"
}

variable "helm_chart_version" {
  description = "Helm chart version"
  type        = string
  default     = "1.0.0"
}

variable "helm_values" {
  description = "Additional Helm values"
  type        = map(string)
  default     = {}
}
