# ─── ECR ────────────────────────────────────────────────────────────────────
resource "aws_ecr_repository" "api" {
  name         = "${local.name}-api"
  force_delete = true
}

# ─── Execution role ─────────────────────────────────────────────────────────
data "aws_iam_policy_document" "assume_lambda" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "lambda_exec" {
  name               = "${local.name}-lambda-exec"
  assume_role_policy = data.aws_iam_policy_document.assume_lambda.json
}

# Minimal managed policy — lets Lambda write to CloudWatch Logs. That's all this
# function needs; it only calls external APIs (OpenAI, Anthropic, Google).
resource "aws_iam_role_policy_attachment" "lambda_basic" {
  role       = aws_iam_role.lambda_exec.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

# ─── Log group (explicit so we control retention + destroy) ─────────────────
resource "aws_cloudwatch_log_group" "lambda" {
  name              = "/aws/lambda/${local.name}-api"
  retention_in_days = 7
}

# ─── Lambda function (container image) ──────────────────────────────────────
# `package_type = Image` means Lambda pulls from ECR instead of using a zip.
# Image URI uses the :latest tag; CI updates the image and calls
# `aws lambda update-function-code` to repoint.
resource "aws_lambda_function" "api" {
  function_name = "${local.name}-api"
  role          = aws_iam_role.lambda_exec.arn

  package_type = "Image"
  image_uri    = local.image_uri

  memory_size = var.lambda_memory_mb
  timeout     = var.lambda_timeout_sec
  architectures = ["x86_64"]

  environment {
    variables = merge(
      var.env_vars,
      var.secret_env_vars,
      # FastAPI's CORSMiddleware enforces its own origin allowlist BEFORE
      # API Gateway's CORS config matters. Pass the same origin to the
      # backend via CORS_ORIGINS (JSON array — pydantic-settings parses it
      # into list[str]). Star fallback keeps preflights working when
      # cors_allow_origin is "*".
      { CORS_ORIGINS = jsonencode([var.cors_allow_origin]) },
    )
  }

  # CI updates image_uri via `aws lambda update-function-code`. Don't fight it.
  lifecycle {
    ignore_changes = [image_uri]
  }

  depends_on = [
    aws_iam_role_policy_attachment.lambda_basic,
    aws_cloudwatch_log_group.lambda,
  ]
}

# ─── HTTP API Gateway ───────────────────────────────────────────────────────
# We front the Lambda with an HTTP API instead of a Function URL because new
# AWS accounts (2024+) have "Block Public Access for Lambda" enabled by
# default, which prevents Principal:"*" resource policies on Function URLs.
# API Gateway invokes Lambda with its own service principal — public access
# block doesn't apply — and it gives us native CORS, throttling, and logs.
resource "aws_apigatewayv2_api" "api" {
  name          = "${local.name}-api"
  protocol_type = "HTTP"

  cors_configuration {
    allow_origins = [var.cors_allow_origin]
    allow_methods = ["*"]
    allow_headers = ["*"]
    max_age       = 3600
  }
}

# AWS_PROXY integration with payload format 2.0: API Gateway hands the Lambda
# Web Adapter a v2 event, which it converts back to a normal HTTP request for
# uvicorn. No code changes required in FastAPI.
resource "aws_apigatewayv2_integration" "lambda" {
  api_id                 = aws_apigatewayv2_api.api.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.api.invoke_arn
  payload_format_version = "2.0"
  timeout_milliseconds   = 30000
}

# Catch-all route — every method, every path is forwarded to the Lambda.
# FastAPI does its own routing inside.
resource "aws_apigatewayv2_route" "any" {
  api_id    = aws_apigatewayv2_api.api.id
  route_key = "ANY /{proxy+}"
  target    = "integrations/${aws_apigatewayv2_integration.lambda.id}"
}

# Default stage with auto-deploy: every change to routes/integrations is
# rolled out immediately. No manual deploy step.
resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.api.id
  name        = "$default"
  auto_deploy = true
}

# Resource-based policy permitting API Gateway (this specific API) to invoke
# the Lambda. Scoped to the API ARN — not a public policy, so Block Public
# Access doesn't trigger.
resource "aws_lambda_permission" "apigw_invoke" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.api.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.api.execution_arn}/*/*"
}
