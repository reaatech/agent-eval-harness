output "cluster_id" {
  description = "ID of the OKE cluster"
  value       = var.create_cluster ? oci_containerengine_cluster.main[0].id : null
}

output "cluster_endpoint" {
  description = "Endpoint of the OKE cluster"
  value       = var.create_cluster ? oci_containerengine_cluster.main[0].endpoints[0].public_endpoint : null
}

output "node_pool_id" {
  description = "ID of the node pool"
  value       = var.create_cluster ? oci_containerengine_node_pool.main[0].id : null
}

output "helm_release_name" {
  description = "Name of the Helm release"
  value       = helm_release.app.name
}

output "helm_release_status" {
  description = "Status of the Helm release"
  value       = helm_release.app.status
}
