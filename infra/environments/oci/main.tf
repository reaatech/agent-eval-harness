terraform {
  required_version = ">= 1.0"
  required_providers {
    oci = {
      source  = "oracle/oci"
      version = "~> 5.0"
    }
  }
}

provider "oci" {
  region               = var.region
  tenancy_ocid         = var.tenancy_ocid
  user_ocid            = var.user_ocid
  fingerprint          = var.fingerprint
  private_key_path     = var.private_key_path
  private_key_password = var.private_key_password
}

# VCN
resource "oci_core_vcn" "main" {
  compartment_id = var.compartment_id
  display_name   = "${var.app_name}-vcn"
  dns_label      = "agenteval"
  cidr_blocks    = [var.vcn_cidr]
}

# Internet Gateway
resource "oci_core_internet_gateway" "main" {
  compartment_id = var.compartment_id
  display_name   = "${var.app_name}-igw"
  vcn_id         = oci_core_vcn.main.id
}

# Public Subnet
resource "oci_core_subnet" "public" {
  compartment_id  = var.compartment_id
  display_name    = "${var.app_name}-public-subnet"
  vcn_id          = oci_core_vcn.main.id
  cidr_block      = var.public_subnet_cidr
  route_table_id  = oci_core_vcn.main.default_route_table_id
  security_list_ids = [oci_core_vcn.main.default_security_list_id]
  dns_label       = "public"
}

# Private Subnet
resource "oci_core_subnet" "private" {
  compartment_id  = var.compartment_id
  display_name    = "${var.app_name}-private-subnet"
  vcn_id          = oci_core_vcn.main.id
  cidr_block      = var.private_subnet_cidr
  route_table_id  = oci_core_route_table.private.id
  security_list_ids = [oci_core_security_list.private.id]
  dns_label       = "private"
  prohibit_internet_ingress = true
}

# Route Table for Private Subnet (NAT Gateway)
resource "oci_core_nat_gateway" "main" {
  compartment_id = var.compartment_id
  vcn_id         = oci_core_vcn.main.id
  display_name   = "${var.app_name}-nat-gw"
}

resource "oci_core_route_table" "private" {
  compartment_id = var.compartment_id
  vcn_id         = oci_core_vcn.main.id
  display_name   = "${var.app_name}-private-rt"

  route_rules {
    destination       = "0.0.0.0/0"
    destination_type  = "CIDR_BLOCK"
    network_entity_id = oci_core_nat_gateway.main.id
  }
}

# Security List for Private Subnet
resource "oci_core_security_list" "private" {
  compartment_id = var.compartment_id
  display_name   = "${var.app_name}-private-sl"
  vcn_id         = oci_core_vcn.main.id

  egress_security_rules {
    destination = "0.0.0.0/0"
    protocol    = "all"
  }

  ingress_security_rules {
    protocol = "6" # TCP
    source   = var.vcn_cidr

    tcp_options {
      min_port = 0
      max_port = 65535
    }
  }
}

# OKE Module
module "oke" {
  source = "../../modules/oci-oke"

  compartment_id              = var.compartment_id
  cluster_name                = var.cluster_name
  vcn_id                      = oci_core_vcn.main.id
  kubernetes_version          = var.kubernetes_version
  is_public                   = false
  cluster_endpoint_subnet_id  = oci_core_subnet.private.id
  service_lb_subnet_ids       = [oci_core_subnet.public.id]
  node_shape                  = var.node_shape
  node_memory_in_gbs          = var.node_memory_in_gbs
  node_ocpus                  = var.node_ocpus
  node_image_id               = data.oci_core_images.node_image.images[0].id
  ssh_public_key              = var.ssh_public_key
  node_pool_subnet_ids        = [oci_core_subnet.private.id]
  availability_domain         = data.oci_identity_availability_domains.ads.availability_domains[0].name
  node_pool_size              = var.node_pool_size
  create_cluster              = true
  app_name                    = var.app_name
  image_url                   = var.image_url
  image_tag                   = var.image_tag
  replicas                    = var.replicas
}

# Data sources
data "oci_identity_availability_domains" "ads" {
  compartment_id = var.compartment_id
}

data "oci_core_images" "node_image" {
  compartment_id           = var.compartment_id
  operating_system         = var.node_os
  operating_system_version = var.node_os_version
  shape                    = var.node_shape
  sort_by                  = "TIMECREATED"
  sort_order               = "DESC"
}
