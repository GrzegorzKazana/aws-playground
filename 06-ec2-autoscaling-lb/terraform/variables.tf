variable "instance_type" {
  default = "t2.micro"
}

variable "ami_image" {
  default = "ami-0115c147c25d1ac54"
}

variable "availability_count" {
  default = 2
}

variable "domain_name" {
  default = "oddly-suspicious.systems"
}

variable "key_file" {
  default = "task06key.pub"
}
