variable "vpc_id" {}
variable "subnet_ids" {}

resource "aws_lb" "cluster_public_alb" {
  name               = "app-load-balancer"
  load_balancer_type = "application"
  subnets            = var.subnet_ids
  security_groups    = [aws_security_group.public_alb_sg.id]
}

resource "aws_lb_listener" "cluster_public_alb_listener" {
  load_balancer_arn = aws_lb.cluster_public_alb.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type = "fixed-response"

    fixed_response {
      content_type = "text/plain"
      message_body = "Hello world"
      status_code  = "200"
    }
  }
}

resource "aws_security_group" "public_alb_sg" {
  name        = "alb-sg"
  description = "allow http/https traffic"
  vpc_id      = var.vpc_id

  ingress {
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    from_port   = 443
    to_port     = 443
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

output "lb_arn" {
  value = aws_lb.cluster_public_alb.arn
}

output "lb_listener_arn" {
  value = aws_lb_listener.cluster_public_alb_listener.arn
}

output "load_balancer_url" {
  value = aws_lb.cluster_public_alb.dns_name
}
