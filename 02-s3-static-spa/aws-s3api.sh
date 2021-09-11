# 1. create an s3 website bucket
aws s3api create-bucket --bucket ap-task02-website-1 --region eu-central-1 --create-bucket-configuration LocationConstraint=eu-central-1
# 2. upload an index html page along with some static resources
aws s3 cp ./public/ s3://ap-task02-website-1/ --recursive
# 3. configure it for serving webpages
#     1. create an index file
#     2. handle client side routing (fallback to index)
aws s3api put-bucket-policy --bucket ap-task02-website-1 --policy file://bucket-policy.json
aws s3api put-bucket-website --bucket ap-task02-website-1 --website-configuration file://website-config.json
# http://ap-task02-website-1.s3.eu-central-1.amazonaws.com/index.html
# http://ap-task02-website-1.s3-website.eu-central-1.amazonaws.com/
# https://stackoverflow.com/questions/16267339/s3-static-website-hosting-route-all-paths-to-index-html

aws cloudfront create-distribution --generate-cli-skeleton yaml-input > distribution.yaml
# edit the config
aws cloudfront create-distribution --cli-input-yaml file://distribution.yaml
# https://docs.aws.amazon.com/AmazonS3/latest/userguide/website-hosting-custom-domain-walkthrough.html

# register a domain, in this example oddly-suspicious.systems registered at name.com (1 year free for github student pack)
# 4. configure Route 53 (dns)
aws route53 create-hosted-zone --name oddly-suspicious.systems --caller-reference $(date "+%Y-%m-%d-%H:%M:%S") --hosted-zone-config Comment="hosted zone for oddly-suspicious.systems at name.com"
# copy name servers to the dns registrar
aws route53 change-resource-record-sets --generate-cli-skeleton yaml-input > records.yaml
# create alias records pointing to cloudfront distribution (A type records)
aws route53 change-resource-record-sets --cli-input-yaml file://records.yaml
aws route53 wait resource-record-sets-changed --id <CHANGE_ID>
#
# SUPER IMPORTANT! use us-east-1 in order to be able to use certificate in cloudfront
aws acm request-certificate --region us-east-1 --domain-name oddly-suspicious.systems --validation-method DNS --idempotency-token 91adc45w --subject-alternative-names '*.oddly-suspicious.systems'
aws acm describe-certificate --region us-east-1 --certificate-arn <CERT_ARN>
# get the CNAME validation record and apply it
aws route53 change-resource-record-sets --cli-input-yaml file://records-dns-challenge.yaml
aws route53 wait resource-record-sets-changed --id <CHANGE_ID>
aws acm wait --region us-east-1 certificate-validated --certificate-arn <CERT_ARN>

aws cloudfront get-distribution-config --id <DISTRO_ID> --output yaml > distribution-aliased.yaml
# edit ViewerCertificate and and ACM certificate arn
aws cloudfront update-distribution --id <DISTRO_ID> --cli-input-yaml file://distribution-aliased.yaml

# 5. configure CloudFront (cdn)
# 6. upload new version of the website
aws s3 sync public s3://ap-task02-website-1
# 7. invalidate cdn cache
aws cloudfront create-invalidation --distribution-id <DISTRO_ID> --paths '/*'
# 8. clean up
# delete certificate
aws acm delete-certificate --region us-east-1 --certificate-arn <CERT_ARM>

# get current records and delete all created manually
aws route53 list-resource-record-sets --hosted-zone-id <HOSTED_ZONE_ID> --output yaml > records-current.yaml
aws route53 change-resource-record-sets --hosted-zone-id <HOSTED_ZONE_ID> --cli-input-yaml file://records-delete.yaml
aws route53 delete-hosted-zone --id <HOSTED_ZONE_ID>

# delete distribution
aws cloudfront get-distribution-config --id <DISTRO_ID> --output yaml > distribution-delete.yaml
# remove aliases, change enabled to false
aws cloudfront wait distribution-deployed --id <DISTRO_ID>
aws cloudfront delete-distribution --id <DISTRO_ID> --if-match <ETAG>

# delete bucket
aws s3 rm s3://ap-task02-website-1 --recursive
aws s3api delete-bucket --bucket ap-task02-website-1
