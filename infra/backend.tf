# S3 remote state backend.
#
# The bucket below is created by the one-time bootstrap module in ./bootstrap/.
# Backend config does not allow variables — replace <YOUR_ACCOUNT_ID> with the
# concrete account id (or use partial config + `-backend-config=...` flags on
# `terraform init`, see DEPLOY.md).
#
# Locking: Terraform 1.10+ supports native S3 state locking via `use_lockfile`,
# so we no longer need a DynamoDB table.

terraform {
  backend "s3" {
    bucket       = "voicecal-tfstate-REPLACE_WITH_ACCOUNT_ID"
    key          = "voicecal/main.tfstate"
    region       = "us-east-1"
    encrypt      = true
    use_lockfile = true
  }
}
