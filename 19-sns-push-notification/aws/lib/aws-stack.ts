import { Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as snsSubscription from 'aws-cdk-lib/aws-sns-subscriptions';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as dynamo from 'aws-cdk-lib/aws-dynamodb';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as ssm from 'aws-cdk-lib/aws-secretsmanager';

export class AwsStack extends Stack {
    constructor(scope: Construct, id: string, props?: StackProps) {
        super(scope, id, props);

        const table = new dynamo.Table(this, 'subscriber-table', {
            partitionKey: {
                name: 'PK',
                type: dynamo.AttributeType.STRING,
            },
            sortKey: {
                name: 'SK',
                type: dynamo.AttributeType.STRING,
            },
        });

        table.addGlobalSecondaryIndex({
            indexName: 'GSI1',
            partitionKey: {
                name: 'GSI1PK',
                type: dynamo.AttributeType.STRING,
            },
            sortKey: {
                name: 'PK',
                type: dynamo.AttributeType.STRING,
            },
        });

        const topic = new sns.Topic(this, 'notification-topic');

        // TODO: generate and import the secret manually
        const vapidKeySecret = new ssm.Secret(this, 'vapid-key-secret');

        const publishHandler = new lambda.Function(this, 'publisher-fn', {
            runtime: lambda.Runtime.NODEJS_14_X,
            code: lambda.Code.fromAsset('../app'),
            handler: 'publish.handler',
            environment: {
                TABLE_NAME: table.tableName,
                VAPID_SECRET_ARN: vapidKeySecret.secretArn,
            },
        });

        const subscribeHandler = new lambda.Function(this, 'subscriber-fn', {
            runtime: lambda.Runtime.NODEJS_14_X,
            code: lambda.Code.fromAsset('../app'),
            handler: 'subscribe.post',
            environment: {
                TABLE_NAME: table.tableName,
            },
        });

        const unsubscribeHandler = new lambda.Function(this, 'unsubscriber-fn', {
            runtime: lambda.Runtime.NODEJS_14_X,
            code: lambda.Code.fromAsset('../app'),
            handler: 'subscribe.delete',
            environment: {
                TABLE_NAME: table.tableName,
            },
        });

        const api = new apigateway.RestApi(this, 'api', {
            defaultCorsPreflightOptions: { allowOrigins: ['*'] },
        });

        const subscriptionModel = api.addModel('SubscriptionModel', {
            schema: {
                type: apigateway.JsonSchemaType.OBJECT,
                properties: {
                    scope: { type: apigateway.JsonSchemaType.STRING },
                    subscription: {
                        type: apigateway.JsonSchemaType.OBJECT,
                        properties: {
                            endpoint: { type: apigateway.JsonSchemaType.STRING },
                            keys: {
                                type: apigateway.JsonSchemaType.OBJECT,
                                properties: {
                                    p256dh: { type: apigateway.JsonSchemaType.STRING },
                                    auth: { type: apigateway.JsonSchemaType.STRING },
                                },
                                required: ['p256dh', 'auth'],
                            },
                        },
                        required: ['endpoint'],
                    },
                },
                required: ['subscription', 'scope'],
            },
        });

        const subscriptionResource = api.root.addResource('subscription');

        subscriptionResource.addMethod('POST', new apigateway.LambdaIntegration(subscribeHandler), {
            requestValidator: new apigateway.RequestValidator(this, 'validator-post', {
                restApi: api,
                validateRequestParameters: true,
                validateRequestBody: true,
            }),
            requestModels: {
                'application/json': subscriptionModel,
            },
        });

        subscriptionResource
            .addResource('{endpoint}')
            .addMethod('DELETE', new apigateway.LambdaIntegration(unsubscribeHandler), {
                requestValidator: new apigateway.RequestValidator(this, 'validator-delete', {
                    restApi: api,
                    validateRequestParameters: true,
                }),
            });

        topic.addSubscription(new snsSubscription.LambdaSubscription(publishHandler));

        table.grantReadWriteData(subscribeHandler);
        table.grantReadWriteData(unsubscribeHandler);
        table.grantReadWriteData(publishHandler);
        vapidKeySecret.grantRead(publishHandler);
    }
}
