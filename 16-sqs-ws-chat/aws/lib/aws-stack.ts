import { Stack, StackProps, CfnOutput, Duration } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as dynamo from 'aws-cdk-lib/aws-dynamodb';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import { CfnStage as CfnApiStage } from 'aws-cdk-lib/aws-apigatewayv2';
import * as apigatewayv2 from '@aws-cdk/aws-apigatewayv2-alpha';
import { WebSocketLambdaIntegration } from '@aws-cdk/aws-apigatewayv2-integrations-alpha';

interface ChatStackProps extends StackProps {
    apiGatewayLogging?: boolean;
}

export class ChatStack extends Stack {
    constructor(scope: Construct, id: string, props: ChatStackProps = {}) {
        super(scope, id, props);

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
        });

        const code = lambda.Code.fromAsset('../app');
        const environment = { TABLE_NAME: table.tableName };

        const disconnectHandler = new lambda.Function(this, 'disconnect-fn', {
            runtime: lambda.Runtime.NODEJS_14_X,
            code,
            handler: 'index.disconnect',
            environment,
        });

        const joinHandler = new lambda.Function(this, 'join-fn', {
            runtime: lambda.Runtime.NODEJS_14_X,
            code,
            handler: 'index.join',
            environment,
        });

        const leaveHandler = new lambda.Function(this, 'leave-fn', {
            runtime: lambda.Runtime.NODEJS_14_X,
            code,
            handler: 'index.leave',
            environment,
        });

        const postMessageHandler = new lambda.Function(this, 'post-message-fn', {
            runtime: lambda.Runtime.NODEJS_14_X,
            code,
            handler: 'index.postMessage',
            environment,
        });

        const defaultHandler = new lambda.Function(this, 'default-fn', {
            runtime: lambda.Runtime.NODEJS_14_X,
            code,
            handler: 'index.default',
            environment,
        });

        table.grantReadWriteData(joinHandler);
        table.grantReadWriteData(leaveHandler);
        table.grantReadWriteData(postMessageHandler);
        table.grantReadWriteData(disconnectHandler);

        const api = new apigatewayv2.WebSocketApi(this, 'ws-api', {
            disconnectRouteOptions: {
                integration: new WebSocketLambdaIntegration(
                    'disconnect-integration',
                    disconnectHandler,
                ),
            },
            defaultRouteOptions: {
                integration: new WebSocketLambdaIntegration('default-integration', defaultHandler),
            },
            routeSelectionExpression: '$request.body.action',
        });

        const apiStage = new apigatewayv2.WebSocketStage(this, 'ws-dev-stage', {
            webSocketApi: api,
            stageName: 'dev',
            autoDeploy: true,
        });

        if (props.apiGatewayLogging) {
            // apigateway2 construct library is in alpha stage, so it does not offer all configuration options
            // therefore, we adjust the created cfn template manually
            // https://docs.aws.amazon.com/cdk/v2/guide/cfn_layer.html
            const cfnStage = apiStage.node.defaultChild as CfnApiStage;
            cfnStage.defaultRouteSettings = {
                dataTraceEnabled: true,
                detailedMetricsEnabled: true,
                loggingLevel: 'INFO',
            };
        }

        api.grantManageConnections(joinHandler);
        api.grantManageConnections(leaveHandler);
        api.grantManageConnections(postMessageHandler);
        api.grantManageConnections(disconnectHandler);

        api.addRoute('join', {
            integration: new WebSocketLambdaIntegration('join-integration', joinHandler),
        });

        api.addRoute('leave', {
            integration: new WebSocketLambdaIntegration('leave-integration', leaveHandler),
        });

        api.addRoute('postMessage', {
            integration: new WebSocketLambdaIntegration(
                'post-message-integration',
                postMessageHandler,
            ),
        });

        new CfnOutput(this, 'Endpoint', {
            value: `wss://${api.apiId}.execute-api.${Stack.of(this).region}.amazonaws.com/${
                apiStage.stageName
            }`,
        });
        new CfnOutput(this, 'JoinFunction.Arn', { value: joinHandler.functionArn });
        new CfnOutput(this, 'LeaveFunction.Arn', { value: leaveHandler.functionArn });
        new CfnOutput(this, 'PostMessageFunction.Arn', { value: postMessageHandler.functionArn });
        new CfnOutput(this, 'DisconnectFunction.Arn', { value: disconnectHandler.functionArn });
        new CfnOutput(this, 'DefaultFunction.Arn', { value: defaultHandler.functionArn });
    }
}
