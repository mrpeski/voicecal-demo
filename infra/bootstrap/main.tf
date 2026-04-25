# One-time bootstrap: creates the S3 bucket that will host Terraform state for
# the main stack (../). This module's own state is local — there's no clean way
# to store the state-bucket's state in itself. Run `terraform apply` here once,
# then never touch it again unless you're rotating the bucket.

terraform {
  required_version = ">= 1.10"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.70"
    }
  }
}

provider "aws" {
  region = var.aws_region
  default_tags {
    tags = {
      Project   = "voicecal"
      ManagedBy = "terraform"
      Purpose   = "tf-state"
    }
  }
}

variable "aws_region" {
  type    = string
  default = "us-east-1"
}

variable "project" {
  type    = string
  default = "voicecal"
}

variable "github_repo" {
  type        = string
  description = "GitHub repo allowed to assume the deploy role, in 'owner/repo' form."
  # Set this in bootstrap.auto.tfvars (gitignored) or pass via -var.
}

data "aws_caller_identity" "me" {}

locals {
  # Bucket names are global; suffix with account id to avoid collisions.
  bucket_name = "${var.project}-tfstate-${data.aws_caller_identity.me.account_id}"
}

resource "aws_s3_bucket" "tfstate" {
  bucket = local.bucket_name

  # State is precious; do NOT auto-delete on `terraform destroy`.
  lifecycle {
    prevent_destroy = true
  }
}

# Versioning lets you recover from a corrupted state push.
resource "aws_s3_bucket_versioning" "tfstate" {
  bucket = aws_s3_bucket.tfstate.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "tfstate" {
  bucket = aws_s3_bucket.tfstate.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "tfstate" {
  bucket                  = aws_s3_bucket.tfstate.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

output "bucket" {
  value       = aws_s3_bucket.tfstate.id
  description = "Set as the GitHub repo variable TF_STATE_BUCKET."
}

output "region" {
  value = var.aws_region
}

# ─── GitHub Actions OIDC ────────────────────────────────────────────────────
#
# AWS-side prerequisite for keyless deploys. Workflows present a JWT issued by
# token.actions.githubusercontent.com; AWS validates it against this provider
# and exchanges it for short-lived credentials. No long-lived access keys.

resource "aws_iam_openid_connect_provider" "github" {
  url             = "https://token.actions.githubusercontent.com"
  client_id_list  = ["sts.amazonaws.com"]
  # GitHub rotates the cert; AWS now validates against the provider's TLS
  # cert chain rather than this thumbprint, but the field is still required.
  # The value below is the long-standing GitHub OIDC root thumbprint.
  thumbprint_list = ["6938fd4d98bab03faadb97b34396831e3780aea1"]
}

data "aws_iam_policy_document" "github_assume" {
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]
    principals {
      type        = "Federated"
      identifiers = [aws_iam_openid_connect_provider.github.arn]
    }
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }
    # Restrict to workflows from this repo (any branch/tag/PR).
    condition {
      test     = "StringLike"
      variable = "token.actions.githubusercontent.com:sub"
      values   = ["repo:${var.github_repo}:*"]
    }
  }
}

resource "aws_iam_role" "github_deploy" {
  name               = "${var.project}-github-deploy"
  assume_role_policy = data.aws_iam_policy_document.github_assume.json
  description        = "Assumed by GitHub Actions via OIDC for terraform + app deploys."
}

# AdministratorAccess is overkill but pragmatic for a 48-hour demo where the
# role provisions S3, ECR, IAM, Lambda, and CloudWatch. Tighten later by
# attaching a custom policy with only what's needed.
resource "aws_iam_role_policy_attachment" "github_admin" {
  role       = aws_iam_role.github_deploy.name
  policy_arn = "arn:aws:iam::aws:policy/AdministratorAccess"
}

output "github_role_arn" {
  value       = aws_iam_role.github_deploy.arn
  description = "Set as the GitHub repo variable AWS_ROLE_TO_ASSUME."
}
