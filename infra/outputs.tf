output "ecr_repo" {
  value = aws_ecr_repository.api.repository_url
}

output "lambda_function_name" {
  value = aws_lambda_function.api.function_name
}

# This is the backend URL. Paste into frontend as VITE_API_BASE_URL.
# Format: https://<api-id>.execute-api.<region>.amazonaws.com
output "api_url" {
  value = aws_apigatewayv2_api.api.api_endpoint
}

output "frontend_bucket" {
  value = aws_s3_bucket.web.id
}

output "frontend_url" {
  value       = "https://${aws_cloudfront_distribution.web.domain_name}"
  description = "Canonical frontend URL (HTTPS via CloudFront). Use this in the browser and in CORS_ALLOW_ORIGIN."
}

output "frontend_url_s3_origin" {
  value       = "http://${aws_s3_bucket_website_configuration.web.website_endpoint}"
  description = "Direct S3 website endpoint — for debugging only; users should hit CloudFront."
}

output "cloudfront_distribution_id" {
  value       = aws_cloudfront_distribution.web.id
  description = "Use with `aws cloudfront create-invalidation` after deploying new frontend assets."
}
