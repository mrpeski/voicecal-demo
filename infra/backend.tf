# S3 remote state backend (partial config).
#
# The bucket is created by the one-time bootstrap module in ./bootstrap/. We
# leave `bucket` empty here so it's supplied at init time via
# `-backend-config=bucket=...` — that lets the same Terraform code work across
# accounts/forks without editing this file.
#
# Locking: Terraform 1.10+ supports native S3 state locking via `use_lockfile`,
# so we no longer need a DynamoDB table.

terraform {
  backend "s3" {
    key          = "voicecal/main.tfstate"
    region       = "us-east-1"
    encrypt      = true
    use_lockfile = true
  }
}
