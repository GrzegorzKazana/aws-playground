output "load_balancer_url" {
  value = aws_lb.cluster_public_alb.dns_name
}
