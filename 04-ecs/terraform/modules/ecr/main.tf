variable "repo_names" {
  type        = list(string)
  description = "respository names"
  default     = []
}


resource "aws_ecr_repository" "repo" {
  for_each = toset(var.repo_names)

  name                 = each.key
  image_tag_mutability = "MUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }
}

output "repository_urls" {
  value = { for r in aws_ecr_repository.repo : r.name => r.repository_url }
}
