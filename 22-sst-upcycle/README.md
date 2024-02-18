# task 22

## goal

Configure and deploy multi-tier application using `sst`, that already is running locally via `docker-compose`. App
consists of service hidden in private subnet and two proxies - to which routing is done by path.

-   service discovery (dns-based communication between services)
-   private subnets

## services

-   _ECR_
-   _ECS_
-   _FARGATE_
-   _VPC_
-   _VPC Endpoints_
-   _Service Connect_

## lessons learnt

Tbh, `sst` constructs are pretty much useless for containerized applications. Each `Service` creates one cluster, vpc,
etc. There is no easy way to deploy multiple services with it. Ended up going pure `aws-cdk`.

Wanted to deploy a stateful workload (e.g. relational database) with EBS persistent volume (to provide data across task
lifetime). The idea was that theere would be a task that mounts a volume which can be reused if the task fails. Due to
the fact EBS volumes are single-attach, such task/service could not be scaled. However, it seems that as of now
(02.2024) it is not possible despite confusing/misleading documentation. Research:

-   https://old.reddit.com/r/aws/comments/194ogwc/amazon_ecs_and_aws_fargate_now_integrate_with/
-   https://docs.aws.amazon.com/AmazonECS/latest/bestpracticesguide/storage-dockervolumes.html#storage-dockervolumes-dataavailability
-   https://blog.developersteve.com/understanding-container-persistence-in-aws-ecs-2363974bed46

TL;DR volumes mentioned above have task lifetime. If one would really want to self-manage relational database and use it
in ECS cluster, the way to go would probably be to just use a EC2 instance.
