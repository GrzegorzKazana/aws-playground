resource "aws_service_discovery_private_dns_namespace" "discovery_namespace" {
  name = "local"
  vpc  = aws_vpc.vpc.id
}

resource "aws_service_discovery_service" "discovery" {
  for_each = local.services

  name = "${each.key}-ecs-service"

  dns_config {
    namespace_id   = aws_service_discovery_private_dns_namespace.discovery_namespace.id
    routing_policy = "MULTIVALUE"

    dns_records {
      ttl  = 10
      type = "A"
    }
  }
}
