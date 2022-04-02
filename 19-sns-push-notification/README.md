# task 19

## goal

Send notifications to clients using the Web Push API and SNS. Store the vapid keys in Secrets Manager

## services

-   _SNS_
-   _DynamoDB_
-   _Lambda_
-   _Secrets Manager_

<!-- https://www.npmjs.com/package/web-push -->
<!-- https://levelup.gitconnected.com/how-to-send-web-push-notifications-for-free-with-aws-and-without-firebase-19d02eadf1f7 -->
<!-- https://github.com/mdn/serviceworker-cookbook -->

## tips

```
docker run --rm -p '8000:8000' amazon/dynamodb-local -jar DynamoDBLocal.jar -sharedDb -dbPath .
aws dynamodb create-table --cli-input-json file://table.json --endpoint-url http://localhost:8000

npx http-serve public -p 8083

aws sns publish --topic-arn $TOPIC --message '{"m":"42"}' --message-attributes '{"scope":{"DataType":"String", "StringValue": "products"}}'
```
