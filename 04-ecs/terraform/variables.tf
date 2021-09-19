variable "app_image" {
  type        = string
  description = "full repostiory url including tag, e.g. <id>.dkr.ecr.<region>.amazonaws.com/someimage:latest"
}

variable "proxy_image" {
  type        = string
  description = "full repostiory url including tag, e.g. <id>.dkr.ecr.<region>.amazonaws.com/someimage:latest"
}

variable "availability_count" {
  type        = number
  description = "number of availability zones to which the app will be deployed"
  default     = 2
}

locals {
  services = toset(["app", "proxy"])
}
