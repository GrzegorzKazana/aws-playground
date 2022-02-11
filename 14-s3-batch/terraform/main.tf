terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 4.0"
    }
  }

  required_version = ">= 0.14.9"
}

provider "aws" {
  profile = "default"
  region  = "eu-central-1"
}

provider "archive" {}

data "aws_caller_identity" "current" {}

resource "aws_s3_bucket" "manifests" {
  bucket = "task-14-manifests"
}

resource "aws_s3_bucket" "input" {
  bucket = "task-14-input"
}

resource "aws_s3_bucket" "output" {
  bucket = "task-14-output"
}

resource "aws_s3_bucket" "reports" {
  bucket = "task-14-reports"
}

resource "aws_s3_object" "a" {
  bucket = aws_s3_bucket.input.id
  key    = "a.txt"

  content_type = "text/plain"
  content      = <<-EOF
  aa
  a
  EOF
}

resource "aws_s3_object" "b" {
  bucket = aws_s3_bucket.input.id
  key    = "b.txt"

  content_type = "text/plain"
  content      = <<-EOF
  bb
  b
  EOF
}

resource "aws_s3_object" "c" {
  bucket = aws_s3_bucket.input.id
  key    = "c.txt"

  content_type = "text/plain"
  content      = <<-EOF
  cc
  c
  EOF
}

resource "aws_iam_role" "lambda_create_job" {
  name = "lambda_create_job_role"

  assume_role_policy = data.aws_iam_policy_document.lambda_role_assume.json

  inline_policy {
    name   = "create_job_policy"
    policy = data.aws_iam_policy_document.allow_create_s3_job.json
  }
}

resource "aws_iam_role" "lambda_execute_job" {
  name = "lambda_execute_job_role"

  assume_role_policy = data.aws_iam_policy_document.lambda_role_assume.json

  inline_policy {
    name   = "execute_job_policy"
    policy = data.aws_iam_policy_document.allow_execute_s3_job.json
  }
}

data "aws_iam_policy_document" "lambda_role_assume" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

data "aws_iam_policy_document" "allow_create_s3_job" {
  # https://docs.aws.amazon.com/AmazonS3/latest/userguide/batch-ops-iam-role-policies.html
  statement {
    actions   = ["s3:CreateJob"]
    resources = ["*"]
  }

  statement {
    actions   = ["iam:PassRole"]
    resources = [aws_iam_role.job.arn]
  }

  statement {
    actions   = ["s3:ListBucket"]
    resources = [aws_s3_bucket.input.arn]
  }

  statement {
    actions   = ["s3:PutObject"]
    resources = ["${aws_s3_bucket.manifests.arn}/*"]
  }

  statement {
    actions   = ["logs:*"]
    resources = ["arn:aws:logs:*:*:*"]
  }
}

data "aws_iam_policy_document" "allow_execute_s3_job" {
  statement {
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.input.arn}/*"]
  }

  statement {
    actions   = ["s3:PutObject"]
    resources = ["${aws_s3_bucket.output.arn}/*"]
  }

  statement {
    actions   = ["logs:*"]
    resources = ["arn:aws:logs:*:*:*"]
  }
}

resource "aws_iam_role" "job" {
  name = "s3_job_role"

  assume_role_policy = data.aws_iam_policy_document.s3_job_assume.json

  inline_policy {
    name   = "job_role_policy"
    policy = data.aws_iam_policy_document.s3_job.json
  }
}

data "aws_iam_policy_document" "s3_job_assume" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["batchoperations.s3.amazonaws.com"]
    }
  }
}

data "aws_iam_policy_document" "s3_job" {
  statement {
    actions   = ["lambda:InvokeFunction"]
    resources = [aws_lambda_function.execute.arn]
  }

  statement {
    actions = [
      "s3:GetObject",
      "s3:GetObjectAcl",
      "s3:GetObjectTagging",
      "s3:ListBucket"
    ]
    resources = [aws_s3_bucket.input.arn, "${aws_s3_bucket.input.arn}/*"]
  }

  statement {
    actions = [
      "s3:GetObject",
      "s3:GetObjectVersion"
    ]
    resources = ["${aws_s3_bucket.manifests.arn}/*"]
  }

  statement {
    actions   = ["s3:PutObject"]
    resources = ["${aws_s3_bucket.reports.arn}/*"]
  }
}

data "archive_file" "lambda_create_job_code" {
  type        = "zip"
  source_file = "${path.module}/../createJob.js"
  output_path = "${path.module}/temp/create.zip"
}

data "archive_file" "lambda_execute_job_code" {
  type        = "zip"
  source_file = "${path.module}/../executeJob.js"
  output_path = "${path.module}/temp/execute.zip"
}

resource "aws_lambda_function" "create" {
  function_name = "task14-create"
  runtime       = "nodejs14.x"
  role          = aws_iam_role.lambda_create_job.arn

  handler          = "createJob.handler"
  filename         = data.archive_file.lambda_create_job_code.output_path
  source_code_hash = data.archive_file.lambda_create_job_code.output_base64sha256

  environment {
    variables = {
      ACCOUNT_ID              = data.aws_caller_identity.current.account_id,
      JOB_ROLE_ARN            = aws_iam_role.job.arn,
      PROCESSING_FUNCTION_ARN = aws_lambda_function.execute.arn,
      INPUT_BUCKET            = aws_s3_bucket.input.id
      INPUT_BUCKET_ARN        = aws_s3_bucket.input.arn
      MANIFEST_BUCKET         = aws_s3_bucket.manifests.id
      MANIFEST_BUCKET_ARN     = aws_s3_bucket.manifests.arn
      REPORTS_BUCKET_ARN      = aws_s3_bucket.reports.arn
    }
  }
}

resource "aws_lambda_function" "execute" {
  function_name = "task14-execute"
  runtime       = "nodejs14.x"
  role          = aws_iam_role.lambda_execute_job.arn

  handler          = "executeJob.handler"
  filename         = data.archive_file.lambda_execute_job_code.output_path
  source_code_hash = data.archive_file.lambda_execute_job_code.output_base64sha256

  environment {
    variables = {
      OUTPUT_BUCKET = aws_s3_bucket.output.id
    }
  }
}

data "aws_lambda_invocation" "this" {
  function_name = aws_lambda_function.create.function_name

  input = "{}"
}

output "create-job-result" {
  value = jsondecode(data.aws_lambda_invocation.this.result)
}
