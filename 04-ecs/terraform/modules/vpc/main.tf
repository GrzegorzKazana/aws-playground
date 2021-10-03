resource "aws_vpc" "vpc" {
  cidr_block           = "10.0.0.0/16"
  enable_dns_support   = true
  enable_dns_hostnames = true
}

resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.vpc.id
}

resource "aws_eip" "nat_gateway" {
  count      = var.availability_count
  vpc        = true
  depends_on = [aws_internet_gateway.main]
}

resource "aws_nat_gateway" "nat_gateway" {
  count = var.availability_count

  subnet_id     = element(aws_subnet.public[*].id, count.index)
  allocation_id = element(aws_eip.nat_gateway[*].id, count.index)
}

resource "aws_subnet" "public" {
  count = var.availability_count

  cidr_block              = cidrsubnet(aws_vpc.vpc.cidr_block, 8, count.index)
  availability_zone       = data.aws_availability_zones.available.names[count.index]
  vpc_id                  = aws_vpc.vpc.id
  map_public_ip_on_launch = true
}

resource "aws_subnet" "private" {
  count = var.availability_count

  cidr_block              = cidrsubnet(aws_vpc.vpc.cidr_block, 8, var.availability_count + count.index)
  availability_zone       = data.aws_availability_zones.available.names[count.index]
  vpc_id                  = aws_vpc.vpc.id
  map_public_ip_on_launch = true
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.vpc.id
}

resource "aws_route" "public" {
  route_table_id         = aws_route_table.public.id
  destination_cidr_block = "0.0.0.0/0"
  gateway_id             = aws_internet_gateway.main.id
}

resource "aws_route_table_association" "public" {
  count = var.availability_count

  route_table_id = aws_route_table.public.id
  subnet_id      = element(aws_subnet.public[*].id, count.index)
}


resource "aws_route_table" "private" {
  count = var.availability_count

  vpc_id = aws_vpc.vpc.id
}

resource "aws_route" "private" {
  count = var.availability_count

  route_table_id         = element(aws_route_table.private[*].id, count.index)
  destination_cidr_block = "0.0.0.0/0"
  nat_gateway_id         = element(aws_nat_gateway.nat_gateway[*].id, count.index)
}

resource "aws_route_table_association" "private" {
  count = var.availability_count

  route_table_id = element(aws_route_table.private[*].id, count.index)
  subnet_id      = element(aws_subnet.private[*].id, count.index)
}
