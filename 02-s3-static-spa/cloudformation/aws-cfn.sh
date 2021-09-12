#! /bin/bash

# Yeah, still a lot of scripting but only because I cannot
# create certificate in the same region as my cloudfront distribution.
# (it is required to create cert in us-east-1, and therefore I cannot
# deploy it in the same stack as the rest of the resources. Hence I
# have to create it manually and also complete the DNS challenge by hand.)

AWS_PAGER=""
AWS_DEFAULT_OUTPUT=text
DOMAIN=oddly-suspicious.systems
ALL_SUBDOMAINS="*.$DOMAIN"
SAFE_DOMAIN_NAME=$(echo $DOMAIN | tr '.' '-')

STACK_NAME=$SAFE_DOMAIN_NAME-website-stack

CERT_ARN=$(aws acm request-certificate \
    --region us-east-1 \
    --domain-name $DOMAIN \
    --validation-method DNS \
    --idempotency-token 91adc45w \
    --subject-alternative-names $ALL_SUBDOMAINS \
    --query 'CertificateArn' \
    --output text --no-cli-pager)

DNS_CHALLENGE_NAME=$(aws acm \
    --region us-east-1 \
    describe-certificate \
    --certificate-arn $CERT_ARN \
    --query 'Certificate.DomainValidationOptions[0].ResourceRecord.Name' \
    --output text --no-cli-pager)
DNS_CHALLENGE_VALUE=$(aws acm \
    --region us-east-1 \
    describe-certificate \
    --certificate-arn $CERT_ARN \
    --query 'Certificate.DomainValidationOptions[0].ResourceRecord.Value' \
    --output text --no-cli-pager)

aws cloudformation validate-template --template-body file://stack-template.cform.yaml
aws cloudformation deploy \
    --stack-name $STACK_NAME \
    --template-file stack-template.cform.yaml \
    --parameter-overrides DomainName=$DOMAIN EnableHttps=true EnableDistributionCerts=false HttpsAcmCertificateARN=$CERT_ARN CertDnsChallengeName=$DNS_CHALLENGE_NAME CertDnsChallengeValue=$DNS_CHALLENGE_VALUE

aws cloudformation wait stack-create-complete --stack-name $STACK_NAME

# Now change the Name Servers at your DNS Provider
# you can check if DNS is properly configured via
# dig +short $DNS_CHALLENGE_NAME
aws cloudformation \
    describe-stacks \
    --stack-name $STACK_NAME \
    --no-cli-pager \
    --query "Stacks[?StackName=='$STACK_NAME'].Outputs"
aws acm --region us-east-1 wait certificate-validated --certificate-arn $CERT_ARN

aws cloudformation deploy \
    --stack-name $STACK_NAME \
    --template-file stack-template.cform.yaml \
    --parameter-overrides DomainName=$DOMAIN EnableHttps=true EnableDistributionCerts=true HttpsAcmCertificateARN=$CERT_ARN CertDnsChallengeName=$DNS_CHALLENGE_NAME CertDnsChallengeValue=$DNS_CHALLENGE_VALUE

aws s3 cp ./public/ "s3://$DOMAIN/" --recursive

echo "Ready!"
echo "https://$DOMAIN"

aws cloudformation delete-stack --stack-name $STACK_NAME
aws acm delete-certificate --region us-east-1 --certificate-arn $CERT_ARN
