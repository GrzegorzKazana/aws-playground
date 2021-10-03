resource "aws_ecs_cluster" "ecs_cluster" {
  name               = var.cluster_name
  capacity_providers = ["FARGATE"]
}

resource "aws_service_discovery_private_dns_namespace" "discovery_namespace" {
  name = "local"
  vpc  = var.vpc_id
}

output "discovery_namespace_id" {
  value = aws_service_discovery_private_dns_namespace.discovery_namespace.id
}
