variable "project_id" {
  description = "GCP project ID for dev environment"
  type        = string
  default     = "agent-eval-harness-dev"
}

variable "region" {
  description = "GCP region"
  type        = string
  default     = "us-central1"
}

variable "image_url" {
  description = "Docker image URL for the service"
  type        = string
  default     = "gcr.io/agent-eval-harness-dev/agent-eval-harness:latest"
}

variable "judge_model" {
  description = "LLM model to use for judging"
  type        = string
  default     = "claude-opus"
}
