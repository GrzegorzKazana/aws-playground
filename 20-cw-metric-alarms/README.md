# task 20

## goal

Explore cloudwatch metrics and alarms. Define custom metric, and set up notifications triggered by alarms.

## services

-   _Cloudwatch_
-   _SNS_
-   _Lambda_

### tips

```bash
for i in $(seq 1 10); do aws lambda invoke --function-name $FN_ARN --payload '{}' --invocation-type Event --no-cli-pager output.json; done

# trigger custom alarm
# every 30s for 5 minutes
for i in $(seq 1 10); do aws lambda invoke --function-name $FN_ARN --cli-binary-format raw-in-base64-out --payload '{"value":999}' --invocation-type Event --no-cli-pager output.json; sleep 30; done

# trigger error metric alarm
for i in $(seq 1 5); do aws lambda invoke --function-name $FN_ARN --log-type Tail --cli-binary-format raw-in-base64-out --payload '{"forceError":true}' --no-cli-pager output.json; done
```
