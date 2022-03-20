# task 18

## goal

On file upload to S3 automatically trigger lambda, which in turn will start Step Function execution. Step
function should trigger an ECS task processing the uploaded file and simulating long processing step (e.g. processing
the file and uploading it to another bucket/key). After the job finishes step function should resume and publish an
event to SNS.

## services

-   _S3_
-   _Lambda_
-   _Step Functions_
-   _ECS_
-   _SNS_
