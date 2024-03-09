import { StackContext, Api, StaticSite, Auth, Config, Function } from 'sst/constructs';
import route53 from 'aws-cdk-lib/aws-route53';
import acm from 'aws-cdk-lib/aws-certificatemanager';
import { Fn, RemovalPolicy } from 'aws-cdk-lib/core';

export function API({ stack }: StackContext) {
    const domain = {
        root: 'lemonads.xyz',
    };
    const GOOGLE_CLIENT_ID = new Config.Parameter(stack, 'google-client-id', {
        value: '170278559623-n9f3jcrapq3o9btlj666bkh3oco3pj85.apps.googleusercontent.com',
    });
    const GOOGLE_CLIENT_SECRET = new Config.Secret(stack, 'google-client-secret');

    const sessionAuthorizer = new Function(stack, 'session-authorizer', {
        handler: 'packages/core/src/api.guard.handler',
    });

    const zone = new route53.HostedZone(stack, 'zone', {
        zoneName: domain.root,
    });

    const certificate = new acm.Certificate(stack, 'zone-ssl-cert', {
        domainName: domain.root,
        subjectAlternativeNames: [`*.${domain.root}`],
        validation: acm.CertificateValidation.fromDns(zone),
    });

    const api = new Api(stack, 'api', {
        customDomain: {
            domainName: `api.${domain.root}`,
            cdk: {
                certificate,
                hostedZone: zone,
            },
        },
        routes: {
            'GET /protected': {
                function: 'packages/core/src/api.handler',
                authorizer: 'session',
            },
            $default: 'packages/core/src/api.handler',
        },
        authorizers: {
            session: {
                type: 'lambda',
                function: sessionAuthorizer,
                // https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-lambda-authorizer.html
                responseTypes: ['simple'],
            },
        },
    });

    const site = new StaticSite(stack, 'webpage', {
        path: 'packages/app',
        dev: { deploy: true },
        buildCommand: 'npm run build',
        buildOutput: 'public/dist',
        environment: {
            VITE_API_BASE_URL: api.customDomainUrl!,
            VITE_GOOGLE_CLIENT_ID: GOOGLE_CLIENT_ID.value,
        },
        customDomain: {
            domainName: domain.root,
            cdk: {
                certificate,
                hostedZone: zone,
            },
        },
    });

    const SITE_URL = new Config.Parameter(stack, 'webpage-url', {
        value: domain.root,
    });

    const auth = new Auth(stack, 'auth', {
        authenticator: {
            handler: 'packages/core/src/auth.handler',
            bind: [GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, SITE_URL],
        },
    });

    // grant access to public key of keypair used for generating jwt
    sessionAuthorizer.bind([auth]);

    auth.attach(stack, {
        api: api as unknown as Api,
        prefix: '/auth',
    });

    // keep that, might use for later projects
    zone.applyRemovalPolicy(RemovalPolicy.RETAIN);
    certificate.applyRemovalPolicy(RemovalPolicy.RETAIN);

    stack.addOutputs({
        api: api.url,
        customApi: api.customDomainUrl,
        nameServers: Fn.join('\n', zone.hostedZoneNameServers || []),
        webpage: site.cdk && site.cdk.distribution.distributionDomainName,
    });
}
