# task 23

## goal

Deploy api and a webapp that uses google as auth provider. Create route that checks user session and route protected by
aws lambda authorizer.

Explored `sst` native `GoogleAdapter` and wrote hand-crafted auth adapters verifying id tokens/code obtained via gsi
library.

## services

-   _Lambda_
-   _API Gateway_
-   _Route53_
-   _Cloudfront_

## tips/docs

-   [gsi id token docs](https://developers.google.com/identity/gsi/web/reference/js-reference)

-   [gsi code docs](https://developers.google.com/identity/oauth2/web/guides/use-code-model)

-   learn to document AWS infrastructure with diagrams https://diagrams.mingrammer.com/docs/getting-started/examples, https://hub.docker.com/r/gtramontina/diagrams
