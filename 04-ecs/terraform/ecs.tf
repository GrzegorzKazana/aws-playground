resource "aws_ecs_cluster" "ecs_cluster" {
  name               = "tesk04-cluster"
  capacity_providers = ["FARGATE"]
}

resource "aws_ecs_service" "services" {
  for_each = {
    app = {
      task = aws_ecs_task_definition.app_task
    }
    proxy = {
      task = aws_ecs_task_definition.proxy_task
    }
  }

  name                               = "${each.key}-ecs-service"
  cluster                            = aws_ecs_cluster.ecs_cluster.name
  task_definition                    = each.value.task.arn
  desired_count                      = 1
  launch_type                        = "FARGATE"
  deployment_minimum_healthy_percent = 100
  enable_execute_command             = true

  load_balancer {
    target_group_arn = aws_lb_target_group.services[each.key].arn
    container_name   = each.key
    container_port   = 80
  }

  network_configuration {
    security_groups  = [aws_security_group.app_sg.id]
    subnets          = aws_subnet.private[*].id
    assign_public_ip = true
  }

  service_registries {
    registry_arn = aws_service_discovery_service.discovery[each.key].arn
  }

  depends_on = [
    aws_lb_listener.cluster_public_alb_listener,
    aws_iam_role_policy_attachment.ecs_task_execution_role_policy_attachment
  ]

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_ecs_task_definition" "app_task" {

  family                   = "app-task"
  execution_role_arn       = aws_iam_role.ecs_task_execution_role.arn
  task_role_arn            = aws_iam_role.ecs_task_role.arn
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  # https://docs.aws.amazon.com/AmazonECS/latest/developerguide/task-cpu-memory-error.html
  cpu    = "256"
  memory = "512"

  container_definitions = jsonencode([
    {
      name        = "app"
      image       = var.app_image
      networkMode = "awsvpc"
      portMappings = [
        {
          containerPort = 80
          hostPort      = 80
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
          awslogs-group         = aws_cloudwatch_log_group.logs.name
          awslogs-region        = data.aws_region.current.name
          awslogs-stream-prefix = "ecs"
        }
      }
      linuxParameters = {
        initProcessEnabled = true
      }
    }
  ])
}

resource "aws_ecs_task_definition" "proxy_task" {
  family                   = "proxy-task"
  execution_role_arn       = aws_iam_role.ecs_task_execution_role.arn
  task_role_arn            = aws_iam_role.ecs_task_role.arn
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  # https://docs.aws.amazon.com/AmazonECS/latest/developerguide/task-cpu-memory-error.html
  cpu    = "256"
  memory = "512"

  container_definitions = jsonencode([
    {
      name        = "proxy"
      image       = var.proxy_image
      networkMode = "awsvpc"
      portMappings = [
        {
          containerPort = 80
          hostPort      = 80
        }
      ]
      environment = [
        {
          name  = "PROXY_PORT"
          value = "80"
        },
        {
          name  = "APP_HOST"
          value = "app-ecs-service.local"
        },
        {
          name  = "APP_PORT"
          value = "80"
        }
      ]
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = aws_cloudwatch_log_group.logs.name
          awslogs-region        = data.aws_region.current.name
          awslogs-stream-prefix = "ecs"
        }
      }
      linuxParameters = {
        initProcessEnabled = true
      }
    }
  ])
}
