variable "repo_names" {
  type        = set(string)
  description = "respository names"
  default     = ["app", "proxy"]
}
