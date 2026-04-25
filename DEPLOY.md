# Deploy

VoiceCal deploys to AWS:

- **Backend** → Lambda (container image, ECR) fronted by an HTTP API Gateway (catch-all `ANY /{proxy+}` route). Runs the unmodified FastAPI app via the [AWS Lambda Web Adapter](https://github.com/awslabs/aws-lambda-web-adapter). API Gateway is used instead of a Lambda Function URL because new AWS accounts (2024+) have "Block Public Access for Lambda" enabled by default, which blocks `Principal:"*"` resource policies on Function URLs at the AWS edge.
- **Frontend** → static SPA on S3 (public website hosting), served over HTTPS via a CloudFront distribution (`*.cloudfront.net` domain, free AWS-managed cert). SPA fallback to `index.html` is configured at both the S3 website layer and CloudFront.
- **CI/CD** → `.github/workflows/deploy.yml`: build & push image, update Lambda, build & sync frontend.

## One-time setup

### 1a. Bootstrap state bucket + GitHub OIDC role (run once, ever)

The bootstrap module creates three things, with **local** Terraform state
(chicken-and-egg — these resources host everything else):

1. S3 bucket for the main stack's Terraform state (versioned, encrypted,
   `use_lockfile` for native locking — Terraform >= 1.10 required)
2. GitHub Actions OIDC provider in your AWS account
3. IAM role `voicecal-github-deploy` that GitHub can assume (scoped to
   `repo:<owner>/<repo>:*`), with `AdministratorAccess` for demo simplicity

```bash
cd infra/bootstrap
echo 'github_repo = "your-gh-username/voicecal-demo"' > bootstrap.auto.tfvars
terraform init
terraform apply
# Note both outputs:
#   bucket           → voicecal-tfstate-123456789012
#   github_role_arn  → arn:aws:iam::123456789012:role/voicecal-github-deploy
```

### 1b. Bootstrap the main stack

```bash
cd infra
cp terraform.tfvars.example terraform.tfvars
# Fill in OPENAI_API_KEY, ANTHROPIC_API_KEY, GOOGLE_* in secret_env_vars
terraform init    # configures the S3 backend
terraform apply
```

Outputs you'll need: `ecr_repo`, `lambda_function_name`, `api_url` (the HTTP API Gateway endpoint — paste into `VITE_API_BASE_URL`), `frontend_bucket`, `frontend_url`.

### 2. First image push (Terraform creates ECR but not the image)

```bash
cd backend
# Regenerate requirements.txt from pyproject if deps changed
uv export --format requirements-txt --no-hashes --no-dev -o requirements.txt

aws ecr get-login-password --region us-east-1 | \
  docker login --username AWS --password-stdin <ecr-url>

docker build --platform linux/amd64 -t <ecr-url>:latest .
docker push <ecr-url>:latest

aws lambda update-function-code \
  --function-name voicecal-api \
  --image-uri <ecr-url>:latest
```

### 3. Configure GitHub secrets/variables

Set in **repo → Settings → Secrets and variables → Actions**.

AWS access uses **OIDC** — no AWS access keys in GitHub.

**Secrets** (only the third-party API keys, used by Terraform to populate
Lambda env vars):
- `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`

**Variables**:
- `AWS_REGION` (e.g. `us-east-1`)
- `AWS_ROLE_TO_ASSUME` — `github_role_arn` output from bootstrap
- `TF_STATE_BUCKET` — `bucket` output from bootstrap
- `ECR_REPOSITORY` (e.g. `voicecal-api`)
- `LAMBDA_FUNCTION` (e.g. `voicecal-api`)
- `FRONTEND_BUCKET` — `frontend_bucket` output from `terraform apply`
- `CLOUDFRONT_DISTRIBUTION_ID` — `cloudfront_distribution_id` output. Set this so the Deploy workflow invalidates the cache after each frontend release.
- `VITE_API_BASE_URL` — API Gateway endpoint (no trailing slash), `api_url` output. Format: `https://<id>.execute-api.<region>.amazonaws.com`
- `CORS_ALLOW_ORIGIN` (optional) — defaults to `*`; tighten to the CloudFront URL (`frontend_url` output, e.g. `https://dxxxxxxxx.cloudfront.net`) after first deploy

### 4. Tighten CORS

After the first frontend deploy, set the `CORS_ALLOW_ORIGIN` repo variable to the **CloudFront URL** (`frontend_url` output — `https://dxxxxxxxx.cloudfront.net`) and re-run the **Terraform / apply** workflow. The Lambda env var `CORS_ORIGINS` is updated in the same step and FastAPI's CORSMiddleware will start allowing only that origin.

## GitHub-driven lifecycle

Two workflows handle everything:

### `Terraform` workflow (provision / destroy)

Manual trigger from **Actions → Terraform → Run workflow**:
- `action: plan` — read-only diff
- `action: apply` — provision or update
- `action: destroy` — tear it all down. Requires `confirm: destroy` in the second input.

AWS auth: OIDC → assumes `AWS_ROLE_TO_ASSUME` (no static keys).
Reads Terraform state from the S3 backend (locked via `use_lockfile`).
Third-party API keys are passed via `TF_VAR_secret_env_vars` (assembled
inline from GitHub secrets) — never written to disk.

### `Deploy` workflow (build & ship app code)

Manual trigger (or uncomment the `push: main` block in
`.github/workflows/deploy.yml` to auto-deploy):
- builds the backend image, pushes to ECR, calls `update-function-code`
- builds the frontend with `VITE_API_BASE_URL` baked in, syncs `dist/` to S3

This workflow does **not** touch Terraform — it only updates the artifacts
that Terraform-managed resources host.

### Typical flow

1. `Terraform / apply` (one time) → infra exists, copy outputs into repo vars
2. `Deploy` (every code change) → ships new image + frontend bundle
3. `Terraform / destroy` → tears it all down (ECR + S3 frontend are
   `force_delete`/`force_destroy`, so this works even with live content)

## Subsequent deploys

Push to main (once the trigger is uncommented in `deploy.yml`) or manually run the **Deploy** workflow. It will:

1. Build the backend image, push `:latest` and `:<sha>` to ECR, point Lambda at `:<sha>`.
2. Build the frontend with `VITE_API_BASE_URL` baked in, sync `dist/` to S3.

## Local dev still works

`VITE_API_BASE_URL` is empty in dev → `apiUrl()` returns paths unchanged → Vite proxies `/api/*` to `localhost:8000`. Nothing about local dev changed.
