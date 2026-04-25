# Deploy

VoiceCal deploys to AWS:

- **Backend** → Lambda (container image, ECR) with a Function URL using `RESPONSE_STREAM` invoke mode (SSE works end-to-end). Runs the unmodified FastAPI app via the [AWS Lambda Web Adapter](https://github.com/awslabs/aws-lambda-web-adapter).
- **Frontend** → static SPA on S3 (public website hosting, SPA fallback to `index.html`).
- **CI/CD** → `.github/workflows/deploy.yml`: build & push image, update Lambda, build & sync frontend.

## One-time setup

### 1a. Bootstrap the Terraform state bucket (run once, ever)

State for the main stack lives in S3 with native S3 locking
(`use_lockfile`, requires Terraform >= 1.10). The bucket itself is created by
a tiny module with **local** state — it has to be, because chicken-and-egg.

```bash
cd infra/bootstrap
terraform init
terraform apply
# Note the `bucket` output, e.g. voicecal-tfstate-123456789012
```

Then edit `infra/backend.tf` and replace `REPLACE_WITH_ACCOUNT_ID` with your
account id (or pass `-backend-config="bucket=..."` to `terraform init` below).

### 1b. Bootstrap the main stack

```bash
cd infra
cp terraform.tfvars.example terraform.tfvars
# Fill in OPENAI_API_KEY, ANTHROPIC_API_KEY, GOOGLE_* in secret_env_vars
terraform init    # configures the S3 backend
terraform apply
```

Outputs you'll need: `ecr_repository_url`, `lambda_function_name`, `lambda_function_url`, `frontend_bucket`, `frontend_url`.

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

Set in **repo → Settings → Secrets and variables → Actions**:

**Secrets** (used by both workflows):
- `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`
- `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`

**Variables**:
- `AWS_REGION` (e.g. `us-east-1`)
- `TF_STATE_BUCKET` — output from the bootstrap step (e.g. `voicecal-tfstate-123456789012`)
- `ECR_REPOSITORY` (e.g. `voicecal-api`)
- `LAMBDA_FUNCTION` (e.g. `voicecal-api`)
- `FRONTEND_BUCKET` — output from `terraform apply`
- `VITE_API_BASE_URL` — Lambda Function URL (no trailing slash), output from `terraform apply`
- `CORS_ALLOW_ORIGIN` (optional) — defaults to `*`; tighten to your S3 website URL after first deploy

### 4. Tighten CORS

After first frontend deploy, set the `CORS_ALLOW_ORIGIN` repo variable to the S3 website URL and re-run the **Terraform / apply** workflow.

## GitHub-driven lifecycle

Two workflows handle everything:

### `Terraform` workflow (provision / destroy)

Manual trigger from **Actions → Terraform → Run workflow**:
- `action: plan` — read-only diff
- `action: apply` — provision or update
- `action: destroy` — tear it all down. Requires `confirm: destroy` in the second input.

Reads Terraform state from the S3 backend (locked via `use_lockfile`).
Secrets are passed via `TF_VAR_secret_env_vars` (assembled inline from
GitHub secrets) — never written to disk.

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
