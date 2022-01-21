# task 12

## goal

Upload files to s3 using aws lambda in two strategies:

-   uploading via lambda
-   direct upload using presigned urls

## services

-   _AWS Lambda_
-   _S3_
-   _Api Gateway_

## tips

```bash
curl -H 'Content-type: image/png'   \
-X PUT   \
--data-binary '@image.png'  \
https://xkxsaab9ab.execute-api.eu-central-1.amazonaws.com/default/direct/key-1

# or using multipart/form
curl -X PUT \
-F 'img1=@image.png'    \
-F 'img2=@image2.png'   \
https://xkxsaab9ab.execute-api.eu-central-1.amazonaws.com/default/direct/key-2
```

```bash
SIGNED_URL=$(curl -X PUT https://xkxsaab9ab.execute-api.eu-central-1.amazonaws.com/default/signed/image1.png)

curl -X POST    \
-F "key=$(echo $SIGNED_URL | jq -r '.fields.key' | echo image-signed-hack.png)" \
-F "bucket=$(echo $SIGNED_URL | jq -r '.fields.bucket')"    \
-F "X-Amz-Algorithm=$(echo $SIGNED_URL | jq -r '.fields["X-Amz-Algorithm"]')"   \
-F "X-Amz-Credential=$(echo $SIGNED_URL | jq -r '.fields["X-Amz-Credential"]')" \
-F "X-Amz-Date=$(echo $SIGNED_URL | jq -r '.fields["X-Amz-Date"]')" \
-F "X-Amz-Security-Token=$(echo $SIGNED_URL | jq -r '.fields["X-Amz-Security-Token"]')" \
-F "Policy=$(echo $SIGNED_URL | jq -r '.fields["Policy"]')" \
-F "X-Amz-Signature=$(echo $SIGNED_URL | jq -r '.fields["X-Amz-Signature"]')"   \
-F "file=@image.png"    \
$(echo $SIGNED_URL | jq -r '.url')
# (if you are a total mad man)

# alternatively create html form with all the listed fields
# or send all that stuff using fetch and FormData
```
