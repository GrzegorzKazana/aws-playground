variable "availability_zone_count" {
  default = 2
}

variable "enable_task_exec" {
  default = true
}

variable "deploy_services" {
  default = true
}

variable "app_image_tag" {
  default = "latest"
}

variable "proxy_image_tag" {
  default = "latest"
}
