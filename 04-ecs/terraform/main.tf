data "aws_region" "current" {}

module "vpc" {
  source = "./modules/vpc"

  availability_count = var.availability_zone_count
}

module "alb" {
  source = "./modules/alb"

  vpc_id     = module.vpc.vpc_id
  subnet_ids = module.vpc.public_subnets
}

module "logs" {
  source = "./modules/cw-logs"

  name = "task04"
}

module "ecs_cluster" {
  source = "./modules/ecs"

  cluster_name = "task04-cluster"
  vpc_id       = module.vpc.vpc_id
}

module "registry" {
  source = "./modules/ecr"

  repo_names = ["app", "proxy"]
}

module "application-app" {
  count  = var.deploy_services ? 1 : 0
  source = "./modules/applications/app"

  cluster_name                = module.ecs_cluster.cluster_name
  vpc_id                      = module.vpc.vpc_id
  subnet_ids                  = module.vpc.private_subnets
  region_name                 = data.aws_region.current.name
  log_group_name              = module.logs.log_group_name
  alb_listener_arn            = module.alb.lb_listener_arn
  discovery_namespace_id      = module.ecs_cluster.discovery_namespace_id
  ecs_task_role_arn           = module.ecs_cluster.ecs_task_role_arn
  ecs_task_execution_role_arn = module.ecs_cluster.ecs_task_execution_role_arn
  docker_image                = "${module.registry.repository_urls["app"]}:${var.app_image_tag}"
  enable_execute_command      = var.enable_task_exec
}

module "application-proxy" {
  count  = var.deploy_services ? 1 : 0
  source = "./modules/applications/proxy"

  cluster_name                = module.ecs_cluster.cluster_name
  vpc_id                      = module.vpc.vpc_id
  subnet_ids                  = module.vpc.private_subnets
  region_name                 = data.aws_region.current.name
  log_group_name              = module.logs.log_group_name
  alb_listener_arn            = module.alb.lb_listener_arn
  discovery_namespace_id      = module.ecs_cluster.discovery_namespace_id
  ecs_task_role_arn           = module.ecs_cluster.ecs_task_role_arn
  ecs_task_execution_role_arn = module.ecs_cluster.ecs_task_execution_role_arn
  docker_image                = "${module.registry.repository_urls["proxy"]}:${var.proxy_image_tag}"
  enable_execute_command      = var.enable_task_exec
}
