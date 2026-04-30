# Infrastructure

This directory contains Terraform configurations for deploying agent-eval-harness to various cloud providers.

## Directory Structure

```
infra/
├── modules/                    # Reusable Terraform modules
│   ├── aws-ecs/               # AWS ECS Fargate compute
│   ├── aws-rds/               # AWS RDS PostgreSQL database
│   ├── aws-redis/             # AWS ElastiCache Redis
│   ├── aws-s3/                # AWS S3 storage
│   ├── aws-secrets/           # AWS Secrets Manager
│   ├── azure-container-apps/  # Azure Container Apps
│   ├── cloud-run/             # GCP Cloud Run
│   ├── netlify/               # Netlify deployment
│   ├── oci-oke/               # Oracle Container Engine (OKE)
│   └── vercel/                # Vercel deployment
└── environments/              # Environment-specific configurations
    ├── aws/                   # AWS deployment
    ├── azure/                 # Azure deployment
    ├── dev/                   # GCP development
    ├── netlify/               # Netlify deployment
    ├── oci/                   # Oracle Cloud deployment
    ├── prod/                  # GCP production
    └── vercel/                # Vercel deployment
```

## Supported Platforms

| Platform | Compute | Database | Cache | Storage | Status |
|----------|---------|----------|-------|---------|--------|
| **AWS** | ECS Fargate | RDS PostgreSQL | ElastiCache Redis | S3 | ✅ Complete |
| **Azure** | Container Apps | PostgreSQL | Redis Cache | Blob Storage | ✅ Complete |
| **GCP** | Cloud Run | Cloud SQL | Memorystore | Cloud Storage | ✅ Complete |
| **OCI** | OKE (Kubernetes) | Autonomous DB | Redis | Object Storage | ✅ Complete |
| **Netlify** | Serverless Functions | External | External | External | ✅ Complete |
| **Vercel** | Serverless Functions | External | External | External | ✅ Complete |

---

## AWS Deployment

### Prerequisites

- AWS CLI configured with appropriate credentials
- Terraform >= 1.0
- A VPC with private and public subnets
- Docker image built and pushed to ECR or public registry

### Quick Start

1. Navigate to the AWS environment:
   ```bash
   cd environments/aws
   ```

2. Copy and configure the terraform.tfvars file:
   ```bash
   cp terraform.tfvars.example terraform.tfvars
   # Edit terraform.tfvars with your values
   ```

3. Required variables:
   - `vpc_id` - ID of your VPC
   - `image_url` - Docker image URL
   - `db_password` - Secure password for the database

4. Initialize and deploy:
   ```bash
   terraform init
   terraform plan
   terraform apply
   ```

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                           VPC                                │
│  ┌─────────────────────────────────────────────────────┐    │
│  │                   Private Subnets                     │    │
│  │  ┌───────────┐  ┌───────────┐  ┌───────────┐        │    │
│  │  │    RDS    │  │   Redis   │  │    ECS    │        │    │
│  │  │ PostgreSQL│  │ElastiCache│  │  Fargate  │        │    │
│  │  └───────────┘  └───────────┘  └───────────┘        │    │
│  │                                          │            │    │
│  │  ┌───────────┐                          │            │    │
│  │  │    S3     │◄─────────────────────────┘            │    │
│  │  └───────────┘                                       │    │
│  └─────────────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────────────┐    │
│  │              Secrets Manager                         │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

---

## Azure Deployment

### Prerequisites

- Azure CLI configured with appropriate credentials
- Terraform >= 1.0
- Docker image pushed to Azure Container Registry

### Quick Start

1. Navigate to the Azure environment:
   ```bash
   cd environments/azure
   ```

2. Configure terraform.tfvars:
   - `resource_group_name` - Name of resource group
   - `location` - Azure region
   - `image_url` - ACR image URL
   - `db_admin_username` - PostgreSQL admin
   - `db_admin_password` - PostgreSQL password

3. Initialize and deploy:
   ```bash
   terraform init
   terraform plan
   terraform apply
   ```

### Architecture

- **Compute**: Azure Container Apps with auto-scaling
- **Database**: Azure Database for PostgreSQL
- **Cache**: Azure Cache for Redis
- **Storage**: Azure Blob Storage
- **Monitoring**: Application Insights + Log Analytics

---

## GCP Deployment

### Prerequisites

- GCP CLI (gcloud) configured
- Terraform >= 1.0
- Docker image pushed to GCR or Artifact Registry

### Quick Start

1. Navigate to the GCP environment:
   ```bash
   cd environments/dev  # or environments/prod
   ```

2. Configure terraform.tfvars:
   - `project_id` - GCP project ID
   - `region` - GCP region
   - `image_url` - Container image URL

3. Initialize and deploy:
   ```bash
   terraform init
   terraform plan
   terraform apply
   ```

### Architecture

- **Compute**: Cloud Run (serverless containers)
- **Secrets**: Secret Manager
- **Storage**: Cloud Storage
- **Monitoring**: Cloud Monitoring + Cloud Trace

---

## OCI Deployment

### Prerequisites

- OCI CLI configured with API signing keys
- Terraform >= 1.0
- Docker image pushed to OCI Registry

### Quick Start

1. Navigate to the OCI environment:
   ```bash
   cd environments/oci
   ```

2. Configure terraform.tfvars:
   - `compartment_id` - OCI compartment
   - `region` - OCI region
   - `tenancy_ocid`, `user_ocid`, `fingerprint` - API credentials
   - `image_url` - Container image URL

3. Initialize and deploy:
   ```bash
   terraform init
   terraform plan
   terraform apply
   ```

### Architecture

- **Compute**: Oracle Container Engine for Kubernetes (OKE)
- **Network**: VCN with public/private subnets
- **Storage**: Object Storage
- **Monitoring**: OCI Monitoring + Logging

---

## Netlify Deployment

### Prerequisites

- Netlify account with API token
- Terraform >= 1.0
- Frontend build artifacts

### Quick Start

1. Navigate to the Netlify environment:
   ```bash
   cd environments/netlify
   ```

2. Configure terraform.tfvars:
   - `netlify_token` - Netlify API token
   - `site_name` - Site name
   - `account_slug` - Account slug

3. Initialize and deploy:
   ```bash
   terraform init
   terraform plan
   terraform apply
   ```

### Features

- Automatic HTTPS
- CDN distribution
- Serverless functions
- Preview deployments
- Custom headers and redirects

---

## Vercel Deployment

### Prerequisites

- Vercel account with API token
- Terraform >= 1.0
- GitHub repository connected to Vercel

### Quick Start

1. Navigate to the Vercel environment:
   ```bash
   cd environments/vercel
   ```

2. Configure terraform.tfvars:
   - `vercel_token` - Vercel API token
   - `project_name` - Project name
   - `repo` - GitHub repository (owner/repo)

3. Initialize and deploy:
   ```bash
   terraform init
   terraform plan
   terraform apply
   ```

### Features

- Automatic preview deployments for PRs
- Edge functions
- Serverless functions
- Custom domains
- Analytics integration

---

## Development

### Running Locally

For local development, use Docker Compose:

```bash
cd ../..  # Project root
docker-compose up
```

### Module Development

When creating new modules:

1. Create directory: `modules/<provider>-<service>/`
2. Add `main.tf`, `variables.tf`, `outputs.tf`
3. Follow naming conventions
4. Document all variables and outputs

### Testing Changes

1. Run `terraform fmt -recursive` to format all files
2. Run `terraform validate` in each environment
3. Run `terraform plan` to preview changes
4. Test in dev environment first

---

## Troubleshooting

### Common Issues

1. **VPC Subnet Discovery (AWS)**: Ensure your VPC has subnets tagged appropriately
2. **Image Pull Errors**: Verify the image URL is accessible from your account
3. **Database Connection**: Check security group rules and network connectivity
4. **Permissions**: Ensure your credentials have sufficient permissions

### Getting Help

- Check the specific environment's README for detailed documentation
- Review the module's variables.tf for configuration options
- Check CloudWatch/Cloud Monitoring logs for runtime issues
