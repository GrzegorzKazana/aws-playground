## task 08

## goal

Create and deploy node.js function while managing their dependencies in various scenarios:

-   only production deps, all ought to be deployed (`app-with-deps`)
-   only production deps, extracted to separate layer (`app-with-deps-layers`)
-   development (custom build step) + production deps, only production deps should be deployed (`app-with-deps-ts`)
-   native production deps via custom docker image (`app-with-native-deps`)
-   native production deps via public layer (`app-with-public-layer`)

## services

-   _Lambda_
-   _Api Gateway (v2)_
-   _ECR_
