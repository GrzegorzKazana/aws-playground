# task 15

## goal

Implement multi-room websocket chat.

## services

-   _API Gateway v2_
-   _AWS Lambda_
-   _DynamoDB_

## stuff

![db schema](./schema.png)

```
docker run --rm -p '8000:8000' amazon/dynamodb-local -jar DynamoDBLocal.jar -sharedDb -dbPath .
aws dynamodb create-table --cli-input-json file://table.json --endpoint-url http://localhost:8000
npx wscat -c wss://${API_ID}.execute-api.eu-central-1.amazonaws.com/${API_STAGE}
```

Uncanny case of gateway api exec log configuration (for more details see the template):
https://www.alexdebrie.com/posts/api-gateway-access-logs/#logging-iam-role
