variable "name" {}

resource "aws_cloudwatch_log_group" "logs" {
  name              = "ecs/service-${var.name}"
  retention_in_days = 14
}

resource "aws_cloudwatch_log_stream" "logs" {
  name           = "service-${var.name}-stream"
  log_group_name = aws_cloudwatch_log_group.logs.name
}


output "log_group_name" {
  value = aws_cloudwatch_log_group.logs.name
}
