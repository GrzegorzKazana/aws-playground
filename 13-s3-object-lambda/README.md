# task 13

## goal

Using s3 object lambda, host an access point that dynamically resizes hosted images.

## services

-   _S3_
-   _S3 Object Lambda_

## tips

```bash
aws s3api get-object --key image.png --bucket $ACCESS_POINT_ARN foo.png
aws s3api get-object --key image_50x50.png --bucket $ACCESS_POINT_ARN foo.png
```

-   use `sam build --use-container` to handle native `sharp` dependencies
