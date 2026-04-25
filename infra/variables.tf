variable "aws_region" {
  type    = string
  default = "us-east-1"
}

variable "project" {
  type    = string
  default = "voicecal"
}

variable "lambda_memory_mb" {
  type        = number
  default     = 1024
  description = "Lambda memory. CPU scales linearly with memory — 1024 MB ≈ 0.5 vCPU. Bump to 2048 if the agent loop feels slow."
}

variable "lambda_timeout_sec" {
  type        = number
  default     = 120
  description = "Max invocation time. Function URL streaming supports up to 15 min."
}

variable "env_vars" {
  type    = map(string)
  default = { LOG_LEVEL = "info" }
}

# Secrets are passed via TF_VAR_secret_env_vars (set in CI from GitHub
# secrets, or in a local terraform.tfvars). They flow into the Lambda's
# `environment.variables`, which means they DO end up in state — protect
# state accordingly (S3 bucket has encryption + public-access blocked).
#
# Note: cannot mark this `ephemeral`, because Lambda's environment.variables
# is a non-ephemeral attribute. If you need stricter isolation, store the
# values in AWS Secrets Manager and have Lambda read them at runtime.
#
# Operational consequence: do NOT run `terraform plan -out=plan.tfplan`
# followed by `terraform apply plan.tfplan` with these values supplied via
# different sources between the two commands. Either use the same source
# (env var or tfvars) for both, or skip the saved-plan workflow and run
# `terraform apply` directly. The CI workflow does the latter.
variable "secret_env_vars" {
  type      = map(string)
  sensitive = true
  default   = {}
}

variable "cors_allow_origin" {
  type        = string
  default     = "*"
  description = "Set to your S3 website URL after the first apply, then re-apply."
}

data "aws_caller_identity" "me" {}

resource "random_id" "s" {
  byte_length = 3
}

locals {
  name        = var.project
  bucket_name = "${var.project}-web-${data.aws_caller_identity.me.account_id}-${random_id.s.hex}"
  image_uri   = "${aws_ecr_repository.api.repository_url}:latest"
}
