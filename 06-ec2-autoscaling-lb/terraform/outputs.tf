output "lb_dns" {
  value = aws_lb.lb.dns_name
}

output "nameservers" {
  value = aws_route53_zone.zone.name_servers
}
