variable "cluster_name" {}
variable "discovery_namespace_id" {}
variable "vpc_id" {}
variable "subnet_ids" {}
variable "region_name" {}
variable "log_group_name" {}
variable "alb_listener_arn" {}
variable "enable_execute_command" {}
variable "ecs_task_role_arn" {}
variable "ecs_task_execution_role_arn" {}
variable "docker_image" {}

locals {
  name           = "app"
  container_name = "app"
  container_port = 80
}

# ---
# SERVICE
resource "aws_ecs_service" "service" {
  name                               = local.name
  cluster                            = var.cluster_name
  task_definition                    = aws_ecs_task_definition.task.arn
  desired_count                      = 1
  launch_type                        = "FARGATE"
  deployment_minimum_healthy_percent = 100
  enable_execute_command             = var.enable_execute_command

  load_balancer {
    target_group_arn = aws_lb_target_group.service.arn
    container_name   = local.container_name
    container_port   = local.container_port
  }

  network_configuration {
    security_groups  = [aws_security_group.sg.id]
    subnets          = var.subnet_ids
    assign_public_ip = false
  }

  service_registries {
    registry_arn = aws_service_discovery_service.discovery.arn
  }

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_ecs_task_definition" "task" {
  family                   = "${local.name}-task"
  execution_role_arn       = var.ecs_task_execution_role_arn
  task_role_arn            = var.ecs_task_role_arn
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  # https://docs.aws.amazon.com/AmazonECS/latest/developerguide/task-cpu-memory-error.html
  cpu    = "256"
  memory = "512"

  container_definitions = jsonencode([
    {
      name        = local.container_name
      image       = var.docker_image
      networkMode = "awsvpc"
      portMappings = [
        {
          containerPort = 80
          hostPort      = local.container_port
        }
      ]
      environment = [
        {
          name  = "APP_PORT"
          value = "80"
        }
      ]
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = var.log_group_name
          awslogs-region        = var.region_name
          awslogs-stream-prefix = "ecs"
        }
      }
      linuxParameters = {
        initProcessEnabled = true
      }
    }
  ])
}

resource "aws_security_group" "sg" {
  name        = "${local.name}-sg"
  description = "allow http traffic"
  vpc_id      = var.vpc_id

  ingress {
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

# ---
# ALB
resource "aws_lb_target_group" "service" {
  vpc_id      = var.vpc_id
  port        = 80
  protocol    = "HTTP"
  target_type = "ip"

  health_check {
    path                = "/"
    protocol            = "HTTP"
    matcher             = "200"
    interval            = 15
    timeout             = 3
    healthy_threshold   = 2
    unhealthy_threshold = 2
  }

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_lb_listener_rule" "rule" {
  listener_arn = var.alb_listener_arn

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.service.arn
  }

  condition {
    path_pattern {
      values = ["/${local.name}/*"]
    }
  }
}

# ---
# SERVICE DISCOVERY
resource "aws_service_discovery_service" "discovery" {
  name = "${local.name}-discovery"

  dns_config {
    namespace_id   = var.discovery_namespace_id
    routing_policy = "MULTIVALUE"

    dns_records {
      ttl  = 10
      type = "A"
    }
  }
}

# ---
# AUTOSCALING
resource "aws_appautoscaling_target" "ecs_service" {
  min_capacity       = 1
  max_capacity       = 4
  resource_id        = "service/${var.cluster_name}/${aws_ecs_service.service.name}"
  scalable_dimension = "ecs:service:DesiredCount"
  service_namespace  = "ecs"
}

resource "aws_appautoscaling_policy" "service" {
  name               = "service-scaling"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.ecs_service.resource_id
  scalable_dimension = aws_appautoscaling_target.ecs_service.scalable_dimension
  service_namespace  = aws_appautoscaling_target.ecs_service.service_namespace

  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }

    target_value = 80
  }
}
