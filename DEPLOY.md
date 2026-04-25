# Deploy

VoiceCal deploys to AWS:

- **Backend** → Lambda (container image, ECR) with a Function URL using `RESPONSE_STREAM` invoke mode (SSE works end-to-end). Runs the unmodified FastAPI app via the [AWS Lambda Web Adapter](https://github.com/awslabs/aws-lambda-web-adapter).
- **Frontend** → static SPA on S3 (public website hosting, SPA fallback to `index.html`).
- **CI/CD** → `.github/workflows/deploy.yml`: build & push image, update Lambda, build & sync frontend.

## One-time setup

### 1. Bootstrap with Terraform

```bash
cd infra
cp terraform.tfvars.example terraform.tfvars
# Fill in OPENAI_API_KEY, ANTHROPIC_API_KEY, GOOGLE_* in secret_env_vars
terraform init
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

### 3. Configure GitHub for CI

Set in **repo → Settings → Secrets and variables → Actions**:

- Secrets: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`
- Variables: `AWS_REGION`, `ECR_REPOSITORY` (e.g. `voicecal-api`), `LAMBDA_FUNCTION` (e.g. `voicecal-api`), `FRONTEND_BUCKET` (from Terraform output), `VITE_API_BASE_URL` (the Lambda Function URL, no trailing slash)

### 4. Tighten CORS

After first frontend deploy, set `cors_allow_origin` in `terraform.tfvars` to the S3 website URL and `terraform apply` again.

## Subsequent deploys

Push to main (once the trigger is uncommented in `deploy.yml`) or manually run the **Deploy** workflow. It will:

1. Build the backend image, push `:latest` and `:<sha>` to ECR, point Lambda at `:<sha>`.
2. Build the frontend with `VITE_API_BASE_URL` baked in, sync `dist/` to S3.

## Local dev still works

`VITE_API_BASE_URL` is empty in dev → `apiUrl()` returns paths unchanged → Vite proxies `/api/*` to `localhost:8000`. Nothing about local dev changed.
