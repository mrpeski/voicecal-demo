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
  description = "Use this in the main stack's backend.tf as `bucket = ...`."
}

output "region" {
  value = var.aws_region
}
