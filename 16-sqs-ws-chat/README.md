# task 16

## goal

Implement multi-room websocket chat, but alleviate shortcomings of the naive approach presented in
[task 15](#../15-ws-chat/README.md), like multiple race conditions (mostly when joining the chat) and possible (however
unlikely) out of order broadcasting of messages. In order to do so, use `sqs FIFO` queue partitioned into multiple
groups based on chat id.

Some of the code will be reused from [task 15](#../15-ws-chat/README.md), but to spice it up, use `aws-cdk` to provision
the infrastructure.

## services

-   _API Gateway v2_
-   _AWS SQS_
-   _AWS Lambda_
-   _DynamoDB_
-   _AWS CDK_

## stuff

![db schema](./schema.png)

```
docker run --rm -p '8000:8000' amazon/dynamodb-local -jar DynamoDBLocal.jar -sharedDb -dbPath .
aws dynamodb create-table --cli-input-json file://table.json --endpoint-url http://localhost:8000
npx wscat -c wss://${API_ID}.execute-api.eu-central-1.amazonaws.com/${API_STAGE}
```

Uncanny case of gateway api exec log configuration (for more details see the template):
https://www.alexdebrie.com/posts/api-gateway-access-logs/#logging-iam-role
