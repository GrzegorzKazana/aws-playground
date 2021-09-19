resource "aws_cloudwatch_log_group" "logs" {
  name              = "ecs/service-task04"
  retention_in_days = 14
}

resource "aws_cloudwatch_log_stream" "logs" {
  name           = "service-task04-stream"
  log_group_name = aws_cloudwatch_log_group.logs.name
}
