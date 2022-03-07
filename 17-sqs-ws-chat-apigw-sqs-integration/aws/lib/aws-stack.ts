import { Stack, StackProps, CfnOutput, Duration, Fn } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaEvents from 'aws-cdk-lib/aws-lambda-event-sources';
import * as dynamo from 'aws-cdk-lib/aws-dynamodb';
import * as apigatewayv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import { JsonSchemaType } from 'aws-cdk-lib/aws-apigateway';

/**
 * resources for migrating to AWS integration type (sending message to sqs directly from api gateway)
 * https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-resource-apigatewayv2-integration.html#cfn-apigatewayv2-integration-requestparameters
 * https://blog.deleu.dev/receiving-sqs-messages-via-api-gateway/
 * https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-develop-integrations-aws-services-reference.html#SQS-SendMessage
 * https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-parameter-mapping.html
 * https://docs.aws.amazon.com/apigateway/latest/developerguide/apigateway-websocket-api-mapping-template-reference.html
 * https://www.alexdebrie.com/posts/aws-api-gateway-service-proxy/
 * https://serverlessland.com/patterns/apigw-websocket-sqs-lambda
 * https://github.com/aws-samples/serverless-patterns/blob/516e073b662d517c0b120997d8a053df6c835f36/apigw-rest-api-dynamodb-cdk/cdk/lib/api-dynamo-stack.ts
 * https://github.com/aws-samples/serverless-patterns/blob/6d8c94aa04257e625acda3e25fbf035166b983bf/apigw-rest-api-dynamodb/template.yml
 * https://github.com/aws-samples/serverless-patterns/blob/main/apigw-websocket-api-sqs-lambda/template.yaml
 */

interface ChatStackProps extends StackProps {
    apiGatewayLogging?: boolean;
}

export class ChatStack extends Stack {
    constructor(scope: Construct, id: string, props: ChatStackProps = {}) {
        super(scope, id, props);

        const { region } = Stack.of(this);

        const table = new dynamo.Table(this, 'chat-table', {
            partitionKey: { name: 'PK', type: dynamo.AttributeType.STRING },
            sortKey: { name: 'SK', type: dynamo.AttributeType.STRING },
        });

        table.addGlobalSecondaryIndex({
            indexName: 'GSI1',
            partitionKey: { name: 'GSI1PK', type: dynamo.AttributeType.STRING },
            sortKey: { name: 'PK', type: dynamo.AttributeType.STRING },
            projectionType: dynamo.ProjectionType.ALL,
        });

        const queue = new sqs.Queue(this, 'chat-queue', {
            fifo: true,
            fifoThroughputLimit: sqs.FifoThroughputLimit.PER_MESSAGE_GROUP_ID,
            visibilityTimeout: Duration.seconds(5),
            deduplicationScope: sqs.DeduplicationScope.MESSAGE_GROUP,
            // TODO: (improvement) add dead-letter-queue
        });

        const api = new apigatewayv2.CfnApi(this, 'ws-cfn-api', {
            name: 'ws-cfn-api',
            protocolType: 'WEBSOCKET',
            routeSelectionExpression: '$request.body.action',
        });

        const apiId = Fn.ref(api.logicalId);

        const apiStage = new apigatewayv2.CfnStage(this, 'ws-dev-stage', {
            apiId,
            stageName: 'dev',
            autoDeploy: true,
            defaultRouteSettings: props.apiGatewayLogging
                ? {
                      dataTraceEnabled: true,
                      detailedMetricsEnabled: true,
                      loggingLevel: 'INFO',
                  }
                : undefined,
        });

        const { modelJoinMessage, modelLeaveMessage, modelPostMessageMessage } =
            this.buildApiModels(apiId);

        // https://docs.aws.amazon.com/sdk-for-go/api/service/apigatewaymanagementapi/
        const apiManagementEndpoint = `https://${apiId}.execute-api.${region}.amazonaws.com/${apiStage.stageName}`;
        const apiWsEndpoint = `wss://${apiId}.execute-api.${region}.amazonaws.com/${apiStage.stageName}`;

        const wsQueueConsumerHandler = new lambda.Function(this, 'ws-queue-consumer-fn', {
            runtime: lambda.Runtime.NODEJS_14_X,
            code: lambda.Code.fromAsset('../app'),
            handler: 'queue-consumer.wsQueueConsumer',
            environment: {
                TABLE_NAME: table.tableName,
                QUEUE_URL: queue.queueUrl,
                API_MANAGEMENT_URL: apiManagementEndpoint,
            },
        });

        const queueEvents = new lambdaEvents.SqsEventSource(queue, {
            batchSize: 10,
            reportBatchItemFailures: true,
        });

        wsQueueConsumerHandler.addEventSource(queueEvents);
        queue.grantConsumeMessages(wsQueueConsumerHandler);
        table.grantReadWriteData(wsQueueConsumerHandler);

        wsQueueConsumerHandler.addToRolePolicy(
            new iam.PolicyStatement({
                actions: ['execute-api:ManageConnections'],
                resources: [
                    `arn:${this.partition}:execute-api:${this.region}:${this.account}:${apiId}/*/*/@connections/*`,
                ],
            }),
        );

        const apiGatewaySqsRole = new iam.Role(this, 'api-to-sqs-role', {
            assumedBy: new iam.ServicePrincipal('apigateway.amazonaws.com'),
            inlinePolicies: {
                allowSendToSqs: new iam.PolicyDocument({
                    statements: [
                        new iam.PolicyStatement({
                            actions: ['sqs:SendMessage'],
                            resources: [queue.queueArn],
                        }),
                    ],
                }),
            },
        });

        // yup, tried to use `AWS_PROXY` integration with `SQS-SendMessage` subtype, but without luck
        // https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-develop-integrations-aws-services-reference.html#SQS-SendMessage
        // finally went with `AWS` integration type as in this example
        // https://github.com/aws-samples/serverless-patterns/tree/main/apigw-websocket-api-sqs-lambda
        const sqsIntegration = new apigatewayv2.CfnIntegration(this, 'default-integration', {
            apiId,
            integrationType: 'AWS',
            integrationMethod: 'POST',
            // https://docs.aws.amazon.com/apigateway/api-reference/resource/integration/
            integrationUri: `arn:aws:apigateway:${this.region}:sqs:path/${this.account}/${queue.queueName}`,
            passthroughBehavior: 'NEVER',
            credentialsArn: apiGatewaySqsRole.roleArn,
            requestParameters: {
                'integration.request.header.Content-Type': "'application/x-www-form-urlencoded'",
            },
            requestTemplates: {
                // attach `connectionId` to request body and construct SQS api call parameters
                $default: `
                    #set($input.path('$').initiatorConnection=$context.connectionId)
                    #set($input.path('$').payload.connection=$context.connectionId)
                    #set($messageBody=$input.json('$'))
                `
                    .trim()
                    .concat(
                        `Action=SendMessage
                        &MessageGroupId=$input.path('$.payload.chat')
                        &MessageDeduplicationId=$context.requestId
                        &MessageBody=$messageBody`
                            .trim()
                            .replace(/\n\s+/g, ''),
                    ),
            },
            templateSelectionExpression: '\\$default',
        });

        new apigatewayv2.CfnRoute(this, 'default-route', {
            apiId,
            routeKey: '$default',
            authorizationType: 'NONE',
            target: `integrations/${Fn.ref(sqsIntegration.logicalId)}`,
            modelSelectionExpression: '$request.body.action',
            requestModels: {
                join: modelJoinMessage.name,
                leave: modelLeaveMessage.name,
                postMessage: modelPostMessageMessage.name,
            },
        });

        const disconnectIntegration = new apigatewayv2.CfnIntegration(
            this,
            'disconnect-integration',
            {
                apiId,
                integrationType: 'AWS',
                integrationMethod: 'POST',
                integrationUri: `arn:aws:apigateway:${this.region}:sqs:path/${this.account}/${queue.queueName}`,
                passthroughBehavior: 'NEVER',
                credentialsArn: apiGatewaySqsRole.roleArn,
                requestParameters: {
                    'integration.request.header.Content-Type':
                        "'application/x-www-form-urlencoded'",
                },
                requestTemplates: {
                    // https://docs.aws.amazon.com/appsync/latest/devguide/resolver-mapping-template-reference-programming-guide.html
                    $default: `
                        #set($globalChatGroup="ChatGroup0")
                        #set($input.path('$').type="disconnect")
                        #set($input.path('$').payload={})
                        #set($input.path('$').payload.connection=$context.connectionId)
                        #set($input.path('$').initiatorConnection=$context.connectionId)
                        #set($messageBody=$input.json('$'))
                    `
                        .trim()
                        .concat(
                            `Action=SendMessage
                            &MessageGroupId=$globalChatGroup
                            &MessageDeduplicationId=$context.requestId
                            &MessageBody=$messageBody`
                                .trim()
                                .replace(/\n\s+/g, ''),
                        ),
                },
                templateSelectionExpression: '\\$default',
            },
        );

        new apigatewayv2.CfnRoute(this, 'disconnect-route', {
            apiId,
            routeKey: '$disconnect',
            authorizationType: 'NONE',
            target: `integrations/${Fn.ref(disconnectIntegration.logicalId)}`,
        });

        new CfnOutput(this, 'Endpoint', { value: apiWsEndpoint });
    }

    public buildApiModels(apiId: string) {
        const modelJoinMessage = new apigatewayv2.CfnModel(this, 'join-message-model', {
            apiId,
            name: 'JoinMessage',
            contentType: 'application/json',
            schema: {
                type: JsonSchemaType.OBJECT,
                properties: {
                    action: { enum: ['join'] },
                    payload: {
                        type: JsonSchemaType.OBJECT,
                        properties: {
                            name: { type: JsonSchemaType.STRING },
                            chat: { type: JsonSchemaType.STRING },
                        },
                        required: ['name', 'chat'],
                    },
                },
                required: ['action', 'payload'],
            },
        });

        const modelLeaveMessage = new apigatewayv2.CfnModel(this, 'leave-message-model', {
            apiId,
            name: 'LeaveMessage',
            contentType: 'application/json',
            schema: {
                type: JsonSchemaType.OBJECT,
                properties: {
                    action: { enum: ['leave'] },
                    payload: {
                        type: JsonSchemaType.OBJECT,
                        properties: {
                            name: { type: JsonSchemaType.STRING },
                            chat: { type: JsonSchemaType.STRING },
                        },
                        required: ['name', 'chat'],
                    },
                },
                required: ['action', 'payload'],
            },
        });

        const modelPostMessageMessage = new apigatewayv2.CfnModel(
            this,
            'post-message-message-model',
            {
                apiId,
                name: 'PostMessageMessage',
                contentType: 'application/json',
                schema: {
                    type: JsonSchemaType.OBJECT,
                    properties: {
                        action: { enum: ['postMessage'] },
                        payload: {
                            type: JsonSchemaType.OBJECT,
                            properties: {
                                name: { type: JsonSchemaType.STRING },
                                chat: { type: JsonSchemaType.STRING },
                                message: { type: JsonSchemaType.STRING },
                            },
                            required: ['name', 'chat', 'message'],
                        },
                    },
                    required: ['action', 'payload'],
                },
            },
        );

        return { modelJoinMessage, modelLeaveMessage, modelPostMessageMessage };
    }
}
