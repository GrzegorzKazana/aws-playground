#! /bin/bash

cd ./terraform
terraform init
terraform plan
terraform apply

export AWS_ACCESS_KEY_ID='<repository_user_id>'
export AWS_SECRET_ACCESS_KEY='<repository_user_secret>'

aws ecr get-login-password | docker login --username AWS --password-stdin '<repository_url>'

docker build -t '<repository_url>':latest ../app
docker push '<repository_url>':latest

docker logout '<repository_url>'
