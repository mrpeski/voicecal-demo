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
    variables = merge(var.env_vars, var.secret_env_vars)
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

# ─── Function URL (HTTPS endpoint, no API Gateway needed) ───────────────────
# invoke_mode = RESPONSE_STREAM enables SSE. The Web Adapter honors this and
# passes streaming responses through chunk by chunk.
resource "aws_lambda_function_url" "api" {
  function_name      = aws_lambda_function.api.function_name
  authorization_type = "NONE"
  invoke_mode        = "RESPONSE_STREAM"

  cors {
    allow_origins = [var.cors_allow_origin]
    allow_methods = ["*"]
    allow_headers = ["*"]
    max_age       = 3600
  }
}

# AuthType=NONE on the Function URL doesn't bypass IAM; you still need a
# resource-based policy permitting lambda:InvokeFunctionUrl from "*" with
# the matching FunctionUrlAuthType condition. Without this, every request
# returns 403 AccessDeniedException.
resource "aws_lambda_permission" "url_public" {
  statement_id           = "FunctionURLAllowPublicAccess"
  action                 = "lambda:InvokeFunctionUrl"
  function_name          = aws_lambda_function.api.function_name
  principal              = "*"
  function_url_auth_type = "NONE"
}
