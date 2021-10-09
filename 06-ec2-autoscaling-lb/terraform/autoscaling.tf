resource "aws_placement_group" "placement" {
  name     = "task06-placement"
  strategy = "spread"
}

resource "aws_autoscaling_group" "asg" {
  name                = "task06-asg"
  min_size            = 2
  max_size            = 4
  health_check_type   = "ELB"
  desired_capacity    = 2
  placement_group     = aws_placement_group.placement.id
  vpc_zone_identifier = aws_subnet.public[*].id

  target_group_arns = [aws_lb_target_group.group.arn]

  launch_template {
    id = aws_launch_template.template.id
  }
}

resource "aws_autoscaling_policy" "asg" {
  name                   = "scale based on cpu usage"
  autoscaling_group_name = aws_autoscaling_group.asg.name
  policy_type            = "TargetTrackingScaling"

  target_tracking_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ASGAverageCPUUtilization"
    }

    target_value = 80.0
  }
}

resource "aws_launch_template" "template" {
  image_id               = var.ami_image
  instance_type          = var.instance_type
  vpc_security_group_ids = [aws_security_group.ec2.id]
  user_data              = filebase64("${path.module}/scripts/launch_nginx.sh")
  key_name               = aws_key_pair.ssh.key_name
}

resource "aws_key_pair" "ssh" {
  public_key = file("${path.module}/${var.key_file}")
}
