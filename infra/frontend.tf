resource "aws_s3_bucket" "web" {
  bucket        = local.bucket_name
  force_destroy = true
}

resource "aws_s3_bucket_public_access_block" "web" {
  bucket                  = aws_s3_bucket.web.id
  block_public_acls       = false
  block_public_policy     = false
  ignore_public_acls      = false
  restrict_public_buckets = false
}

resource "aws_s3_bucket_website_configuration" "web" {
  bucket = aws_s3_bucket.web.id
  index_document {
    suffix = "index.html"
  }
  # SPA fallback
  error_document {
    key = "index.html"
  }
}

data "aws_iam_policy_document" "web_public_read" {
  statement {
    sid       = "PublicRead"
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.web.arn}/*"]
    principals {
      type        = "*"
      identifiers = ["*"]
    }
  }
}

resource "aws_s3_bucket_policy" "web" {
  bucket = aws_s3_bucket.web.id
  policy = data.aws_iam_policy_document.web_public_read.json

  depends_on = [aws_s3_bucket_public_access_block.web]
}

# ─── CloudFront (HTTPS in front of the S3 website) ──────────────────────────
# Browsers increasingly refuse HTTP. CloudFront gives us a free *.cloudfront.net
# domain with a valid TLS cert, and uses the S3 *website* endpoint as a custom
# origin so we keep the index.html / SPA-fallback behaviour for free (no
# CloudFront Function needed).
resource "aws_cloudfront_distribution" "web" {
  enabled             = true
  default_root_object = "index.html"
  comment             = "${local.name} frontend"
  price_class         = "PriceClass_100" # US/EU only — cheapest tier

  origin {
    domain_name = aws_s3_bucket_website_configuration.web.website_endpoint
    origin_id   = "s3-website"

    # S3 website endpoints only speak HTTP. CloudFront ↔ S3 traffic stays in
    # AWS so this is acceptable; the public hop (browser ↔ CloudFront) is
    # HTTPS, which is what we care about.
    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "http-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }
  }

  default_cache_behavior {
    target_origin_id       = "s3-website"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    compress               = true

    # AWS-managed CachingOptimized policy id. Standard for static SPAs.
    cache_policy_id = "658327ea-f89d-4fab-a63d-7e88639e58f6"
  }

  # SPA fallback at the CloudFront layer too. The S3 website config already
  # rewrites unknown paths to index.html with a 200, but CloudFront caches
  # the 404/403 from S3 in some edge cases — these mappings make it bulletproof.
  custom_error_response {
    error_code         = 403
    response_code      = 200
    response_page_path = "/index.html"
  }
  custom_error_response {
    error_code         = 404
    response_code      = 200
    response_page_path = "/index.html"
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = true
  }
}
