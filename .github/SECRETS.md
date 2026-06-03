# GitHub Actions secrets and variables

Configure these in **Settings → Secrets and variables → Actions**.

## Repository secrets

| Secret | Used by | Description |
|--------|---------|-------------|
| `AWS_REGION` | Staging, Production | AWS region (e.g. `us-east-1`) |
| `ECR_REGISTRY` | Staging, Production | ECR registry host (`123456789.dkr.ecr.us-east-1.amazonaws.com`) |
| `ECR_REPOSITORY_BACKEND` | Staging, Production | Backend ECR repository name |
| `ECR_REPOSITORY_FRONTEND` | Staging, Production | Frontend ECR repository name |
| `AWS_ROLE_ARN_STAGING` | Staging | IAM role ARN for OIDC (staging deploy) |
| `AWS_ROLE_ARN_PRODUCTION` | Production | IAM role ARN for OIDC (production deploy) |
| `ECS_CLUSTER_STAGING` | Staging | ECS cluster name |
| `ECS_CLUSTER_PRODUCTION` | Production | ECS cluster name |
| `ECS_SERVICE_BACKEND_STAGING` | Staging | Backend ECS service name |
| `ECS_SERVICE_FRONTEND_STAGING` | Staging | Frontend ECS service name |
| `ECS_SERVICE_BACKEND_PRODUCTION` | Production | Backend ECS service name |
| `ECS_SERVICE_FRONTEND_PRODUCTION` | Production | Frontend ECS service name |
| `ECS_MIGRATE_TASK_FAMILY_STAGING` | Staging | Task definition family for migrations (`gradeai-migrate-staging`) |
| `ECS_SUBNETS_STAGING` | Staging | Comma-separated private subnet IDs (no spaces) |
| `ECS_SECURITY_GROUPS_STAGING` | Staging | Comma-separated security group IDs |
| `CODEDEPLOY_APPLICATION_PRODUCTION` | Production | CodeDeploy application name |
| `CODEDEPLOY_DEPLOYMENT_GROUP_BACKEND` | Production | CodeDeploy deployment group (backend) |
| `CODEDEPLOY_DEPLOYMENT_GROUP_FRONTEND` | Production | CodeDeploy deployment group (frontend) |
| `SLACK_WEBHOOK_URL` | Staging, Production | Slack incoming webhook URL |

## Repository variables

| Variable | Description |
|----------|-------------|
| `STAGING_URL` | Public staging base URL (e.g. `https://staging.gradeai.example.com`) |
| `PRODUCTION_URL` | Public production base URL |
| `STAGING_API_BASE_URL` | Vite API path for staging frontend build (default `/api/v1`) |
| `PRODUCTION_SOURCE_SHA` | Optional: git SHA to promote when tagging (if tag commit ≠ staged image) |

## Environments

Create GitHub environments in **Settings → Environments**:

### `staging`
- Optional protection rules (none required for auto-deploy from `main`).

### `production`
- **Required reviewers** (manual approval before deploy).
- Deployment branches: tags matching `v*.*.*` only.

## AWS OIDC setup (recommended)

1. Create an IAM OIDC identity provider for `token.actions.githubusercontent.com`.
2. Create IAM roles `gradeai-github-staging` and `gradeai-github-production` with trust policy:

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": {
      "Federated": "arn:aws:iam::ACCOUNT_ID:oidc-provider/token.actions.githubusercontent.com"
    },
    "Action": "sts:AssumeRoleWithWebIdentity",
    "Condition": {
      "StringEquals": {
        "token.actions.githubusercontent.com:aud": "sts.amazonaws.com"
      },
      "StringLike": {
        "token.actions.githubusercontent.com:sub": "repo:ORG/gradeai:*"
      }
    }
  }]
}
```

3. Attach policies: `AmazonEC2ContainerRegistryPowerUser`, ECS deploy, CodeDeploy, SSM read (for task secrets), CloudWatch Logs.

## Task definitions

Replace placeholders in `deploy/ecs/*.json` (`ACCOUNT_ID`, `REGION`, ARNs) before first deploy, or maintain live definitions in AWS and sync periodically.

## Image tags

| Environment | Backend / Frontend tags |
|-------------|-------------------------|
| Staging | `staging-<git-sha>`, `staging-latest` |
| Production | `production-<semver>`, `production-latest` (promoted from staging, not rebuilt) |
