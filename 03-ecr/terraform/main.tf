terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 3.27"
    }
  }

  required_version = ">= 0.14.9"
}

provider "aws" {
  profile = "default"
  region  = "eu-central-1"
}

variable "repo_name" {
  type        = string
  description = "respository name"
  default     = "foobar"
}

variable "user_name" {
  type        = string
  description = "username authenticated to use the repo"
  default     = "foobar-repo-user"
}


resource "aws_ecr_repository" "repo" {
  name                 = var.repo_name
  image_tag_mutability = "MUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }
}

resource "aws_ecr_lifecycle_policy" "repo_expire_policy" {
  repository = aws_ecr_repository.repo.name

  policy = <<EOF
{
    "rules": [
        {
            "rulePriority": 1,
            "description": "Expire images older than 14 days",
            "selection": {
                "tagStatus": "untagged",
                "countType": "sinceImagePushed",
                "countUnit": "days",
                "countNumber": 14
            },
            "action": {
                "type": "expire"
            }
        },
        {
            "rulePriority": 2,
            "description": "Expire tagged images older than latest 5",
            "selection": {
                "tagStatus": "tagged",
                "tagPrefixList": ["v-", "master-"],
                "countType": "imageCountMoreThan",
                "countNumber": 5
            },
            "action": {
                "type": "expire"
            }
        }
    ]
}
EOF
}

# Create user that can access the registry
resource "aws_iam_user" "repository_user" {
  name = var.user_name
}

resource "aws_iam_access_key" "repository_user_key" {
  user = aws_iam_user.repository_user.name
}

resource "aws_iam_user_policy" "repository_user_policy" {
  user = aws_iam_user.repository_user.name
  # https://docs.aws.amazon.com/AmazonECR/latest/userguide/security_iam_id-based-policy-examples.html#security_iam_id-based-policy-examples-access-one-bucket
  policy = <<POLICY
{
   "Version":"2012-10-17",
   "Statement":[
      {
         "Sid":"ListImagesInRepository",
         "Effect":"Allow",
         "Action":[
            "ecr:ListImages"
         ],
         "Resource":"${aws_ecr_repository.repo.arn}"
      },
      {
         "Sid":"GetAuthorizationToken",
         "Effect":"Allow",
         "Action":[
            "ecr:GetAuthorizationToken"
         ],
         "Resource":"*"
      },
      {
         "Sid":"ManageRepositoryContents",
         "Effect":"Allow",
         "Action":[
                "ecr:BatchCheckLayerAvailability",
                "ecr:GetDownloadUrlForLayer",
                "ecr:GetRepositoryPolicy",
                "ecr:DescribeRepositories",
                "ecr:ListImages",
                "ecr:DescribeImages",
                "ecr:BatchGetImage",
                "ecr:InitiateLayerUpload",
                "ecr:UploadLayerPart",
                "ecr:CompleteLayerUpload",
                "ecr:PutImage"
         ],
         "Resource":"${aws_ecr_repository.repo.arn}"
      }
   ]
}
POLICY
}

output "repository_url" {
  value = aws_ecr_repository.repo.repository_url
}

output "repository_user_id" {
  value = aws_iam_access_key.repository_user_key.id
}

output "repository_user_secret" {
  value     = aws_iam_access_key.repository_user_key.secret
  sensitive = true
}
