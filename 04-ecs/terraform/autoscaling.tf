resource "aws_appautoscaling_target" "ecs_service" {
  for_each = local.services

  min_capacity       = 1
  max_capacity       = 4
  resource_id        = "service/${aws_ecs_cluster.ecs_cluster.name}/${aws_ecs_service.services[each.key].name}"
  scalable_dimension = "ecs:service:DesiredCount"
  service_namespace  = "ecs"
}

resource "aws_appautoscaling_policy" "service" {
  for_each = local.services

  name               = "service-scaling"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.ecs_service[each.key].resource_id
  scalable_dimension = aws_appautoscaling_target.ecs_service[each.key].scalable_dimension
  service_namespace  = aws_appautoscaling_target.ecs_service[each.key].service_namespace

  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }

    target_value = 80
  }

  # this metric is just for easy testing (it's easy to cause scale out event)
  #   target_tracking_scaling_policy_configuration {
  #     target_value       = 30
  #     scale_in_cooldown  = 60
  #     scale_out_cooldown = 60

  #     predefined_metric_specification {
  #       predefined_metric_type = "ALBRequestCountPerTarget"
  #       resource_label         = "${aws_lb.cluster_public_alb.arn_suffix}/${aws_lb_target_group.services["app"].arn_suffix}"
  #     }
  #   }
}
