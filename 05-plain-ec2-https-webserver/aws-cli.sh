#! /bin/bash

KEYPAIR_NAME=task05keypair
PRIVATE_KEY_FILE=task05keypair.pem
PUBLIC_KEY_FILE=task05keypair.pub
SECURITY_GROUP_NAME=task05secgroup
INSTANCE_AMI=ami-0115c147c25d1ac54
INSTANCE_TYPE=t2.micro

aws ec2 create-key-pair --key-name $KEYPAIR_NAME --query KeyMaterial --output text > $PRIVATE_KEY_FILE
chmod 400 $PRIVATE_KEY_FILE
ssh-keygen -y -f $PRIVATE_KEY_FILE > $PUBLIC_KEY_FILE

# optional for default VPC, all traffic is allowed by default
SECURITY_GROUP_ID=$(aws ec2 create-security-group \
    --group-name $SECURITY_GROUP_NAME \
    --description 'ssh,http,https access' \
    --query GroupId \
    --output text --no-cli-pager)

aws ec2 authorize-security-group-ingress --group-name $SECURITY_GROUP_NAME --protocol tcp --port 22 --cidr 0.0.0.0/0
aws ec2 authorize-security-group-ingress --group-name $SECURITY_GROUP_NAME --protocol tcp --port 80 --cidr 0.0.0.0/0
aws ec2 authorize-security-group-ingress --group-name $SECURITY_GROUP_NAME --protocol tcp --port 443 --cidr 0.0.0.0/0

# --associate-public-ip-address is optional for default VPC
INSTANCE_ID=$(aws ec2 run-instances \
    --image-id $INSTANCE_AMI \
    --instance-type $INSTANCE_TYPE \
    --key-name $KEYPAIR_NAME \
    --security-group-ids $SECURITY_GROUP_ID \
    --associate-public-ip-address \
    --query 'Instances[*].InstanceId' \
    --output text --no-cli-pager)

aws ec2 wait instance-running --instance-ids $INSTANCE_ID

PUBLIC_IP=$(aws ec2 describe-instances --instance-ids $INSTANCE_ID --query 'Reservations[*].Instances[*].PublicIpAddress' --output text --no-cli-pager)
PUBLIC_DNS=$(aws ec2 describe-instances --instance-ids $INSTANCE_ID --query 'Reservations[*].Instances[*].PublicDnsName' --output text --no-cli-pager)

ssh -i $PRIVATE_KEY_FILE ec2-user@$PUBLIC_IP
# VIA SSH START
sudo yum -y update
sudo amazon-linux-extras install epel
sudo yum install -y nginx
sudo nginx
# VIA SSH END

PUBLIC_ELASTIC_IP=$(aws ec2 allocate-address --query PublicIp --output text --no-cli-pager)
ELASTIC_IP_ALLOCATION=$(aws ec2 describe-addresses --public-ips $PUBLIC_ELASTIC_IP --query 'Addresses[*].AllocationId' --output text --no-cli-pager)
ASSOCIATION_ID=$(aws ec2 associate-address --allocation-id $ELASTIC_IP_ALLOCATION --instance-id $INSTANCE_ID --query 'AssociationId' --output text --no-cli-pager)
PUBLIC_ELASTIC_DNS=$(aws ec2 describe-instances --instance-ids $INSTANCE_ID --query 'Reservations[*].Instances[*].PublicDnsName' --output text --no-cli-pager)

# Register a DNS domain, and point it to $PUBLIC_ELASTIC_IP via A type Record

ssh -i $PRIVATE_KEY_FILE ec2-user@$PUBLIC_ELASTIC_IP
# VIA SSH START
sudo yum install -y certbot python-certbot-nginx
sudo certbot --nginx
# VIA SSH END

aws ec2 terminate-instances --instance-ids $INSTANCE_ID
aws ec2 release-address --allocation-id $ELASTIC_IP_ALLOCATION
aws ec2 delete-security-group --group-id $SECURITY_GROUP_ID
aws ec2 delete-key-pair --key-name $KEYPAIR_NAME
