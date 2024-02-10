# task 21

## goal

Implement and deploy non-trivial app using [sst](https://sst.dev/).

Create a CRUD task-management api with project archive exports to _S3_ via _DynamoDB Streams_ and _SQS_. Implement
single table design using [ElectroDB](https://electrodb.dev/). As a bonus round, set up the same schema in _RDS_
database and self manage initialization and migrations. Use _DB IAM Authentication_ instead of credentials.

## services

-   _Lambda_
-   _S3_
-   _API Gateway_
-   _SQS_
-   _DynamoDB_
-   _RDS_

## tips/docs

-   frustrating limitation of `sst` at the moment: https://github.com/sst/sst/issues/2247

-   connecting to RDS instance using SSL and IAM Authentication

    -   https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/PostgreSQL.Concepts.General.SSL.html
    -   https://aws.amazon.com/blogs/compute/using-amazon-rds-proxy-with-aws-lambda/

    -   ```bash
        export PGPASSWORD=$(aws rds generate-db-auth-token --hostname $PGHOST --port 5432 --region eu-central-1 --username $PGUSER)
        ```
    -   ```bash
        psql "sslrootcert=21-sst-recipes/packages/functions/src/rds/cert/eu-central-1-bundle.pem sslmode=verify-full"
        ```

-   learn to document AWS infrastructure with diagrams https://diagrams.mingrammer.com/docs/getting-started/examples, https://hub.docker.com/r/gtramontina/diagrams
