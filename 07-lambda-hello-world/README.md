# task 07

## goal

1. Deploy hello-world lambda to REST (v1) and HTTP (v2) apis, and explore following features:
    - lambda proxy integration
    - lambda custom integration
    - request/response validation (v1)
    - request/response templating (v1)

## services

-   _AWS SAM_
-   _Lambda_
-   _API Gateway v1_
-   _API Gateway v2_

## tips:

-   when using `sam local start-api` use the `--warm-containers EAGER` flag for acceptable response times.
-   `sam local start-api` cli does not support custom lambda integrations (proxy only)
