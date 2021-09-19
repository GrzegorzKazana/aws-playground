output "repository_url" {
  value = [for r in aws_ecr_repository.repo : r.repository_url]
}
