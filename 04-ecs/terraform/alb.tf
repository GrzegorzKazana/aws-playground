resource "aws_lb" "cluster_public_alb" {
  name               = "task04-alb"
  load_balancer_type = "application"
  subnets            = aws_subnet.public[*].id
  security_groups    = [aws_security_group.public_alb_sg.id]
}

resource "aws_lb_listener" "cluster_public_alb_listener" {
  load_balancer_arn = aws_lb.cluster_public_alb.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.services["app"].arn
  }
}

resource "aws_lb_listener_rule" "rules" {
  for_each = toset(local.services)

  listener_arn = aws_lb_listener.cluster_public_alb_listener.arn

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.services[each.key].arn
  }

  condition {
    path_pattern {
      values = ["/${each.key}/*"]
    }
  }
}

resource "aws_lb_target_group" "services" {
  for_each = toset(local.services)

  vpc_id      = aws_vpc.vpc.id
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
