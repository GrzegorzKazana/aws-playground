resource "aws_ecr_repository" "repo" {
  for_each = var.repo_names

  name                 = each.key
  image_tag_mutability = "MUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }
}

