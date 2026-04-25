output "ecr_repo" {
  value = aws_ecr_repository.api.repository_url
}

output "lambda_function_name" {
  value = aws_lambda_function.api.function_name
}

# This is the backend URL. Paste into frontend as VITE_API_BASE_URL.
# Format: https://<id>.lambda-url.<region>.on.aws
output "api_url" {
  value = aws_lambda_function_url.api.function_url
}

output "frontend_bucket" {
  value = aws_s3_bucket.web.id
}

output "frontend_url" {
  value = "http://${aws_s3_bucket_website_configuration.web.website_endpoint}"
}
