#! /bin/bash

yum -y update
amazon-linux-extras install -y epel
yum install -y nginx
nginx
echo "hello $RANDOM" > /usr/share/nginx/html/index.html
echo "pong" > /usr/share/nginx/html/ping.html
