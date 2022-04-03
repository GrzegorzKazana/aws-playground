import { Duration, Stack, StackProps, CfnOutput } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as cw from 'aws-cdk-lib/aws-cloudwatch';
import * as cwAction from 'aws-cdk-lib/aws-cloudwatch-actions';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as snsSubscription from 'aws-cdk-lib/aws-sns-subscriptions';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';

export interface AwsStackProps extends StackProps {
    alarmEmail: string;
}

export class AwsStack extends Stack {
    constructor(scope: Construct, id: string, props: AwsStackProps) {
        super(scope, id, props);

        const handler = new lambda.Function(this, 'measured-function', {
            code: lambda.Code.fromAsset('../app'),
            handler: 'index.handler',
            runtime: lambda.Runtime.NODEJS_14_X,
            layers: [
                lambda.LayerVersion.fromLayerVersionAttributes(this, 'insights-layer', {
                    // https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/Lambda-Insights-Getting-Started-clouddevelopmentkit.html
                    layerVersionArn:
                        'arn:aws:lambda:eu-central-1:580247275435:layer:LambdaInsightsExtension:14',
                }),
            ],
            environment: {
                // to be added later
                CUSTOM_METRIC_NAME: '',
                CUSTOM_METRIC_NAMESPACE: '',
            },
        });

        // https://aws.permissions.cloud/managedpolicies/CloudWatchLambdaInsightsExecutionRolePolicy
        handler.addToRolePolicy(
            new iam.PolicyStatement({
                actions: ['logs:CreateLogGroup'],
                resources: ['*'],
            }),
        );
        handler.addToRolePolicy(
            new iam.PolicyStatement({
                actions: ['logs:CreateLogStream', 'logs:PutLogEvents'],
                resources: ['arn:aws:logs:*:*:log-group:/aws/lambda-insights:*'],
            }),
        );

        handler.addToRolePolicy(
            new iam.PolicyStatement({
                actions: ['cloudwatch:PutMetricData'],
                resources: ['*'],
            }),
        );

        const topic = new sns.Topic(this, 'alarm-topic');
        const subscription = new snsSubscription.EmailSubscription(props.alarmEmail);

        topic.addSubscription(subscription);

        const customMetric = new cw.Metric({
            metricName: 'Task20CustomMetric',
            namespace: 'Task20',
            period: Duration.minutes(1),
        });

        const customMetricAlarm = new cw.Alarm(this, 'task-20-cw-custom-alarm', {
            metric: customMetric,
            threshold: 100,
            alarmName: 'Task20CwCustomAlarm',
            comparisonOperator: cw.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
            // with metric of 1 min period, this means that the the alarm will be triggered
            // if in 2 out of 3 consecutive minutes the threshold will be surpassed
            evaluationPeriods: 3,
            datapointsToAlarm: 2,
            // https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/AlarmThatSendsEmail.html#alarms-and-missing-data
            treatMissingData: cw.TreatMissingData.IGNORE,
        });

        // alarm triggered if >= 3 invocations fail in 1 minute period
        const handlerErrorAlarm = new cw.Alarm(this, 'task-20-error-alarm', {
            metric: handler.metricErrors({ period: Duration.minutes(1) }),
            threshold: 3,
            alarmName: 'Task20CwErrorAlarm',
            comparisonOperator: cw.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
            evaluationPeriods: 1,
            treatMissingData: cw.TreatMissingData.NOT_BREACHING,
        });

        customMetricAlarm.addAlarmAction(new cwAction.SnsAction(topic));
        handlerErrorAlarm.addAlarmAction(new cwAction.SnsAction(topic));

        handler.addEnvironment('CUSTOM_METRIC_NAME', customMetric.metricName);
        handler.addEnvironment('CUSTOM_METRIC_NAMESPACE', customMetric.namespace);

        new CfnOutput(this, 'handler-arn', { value: handler.functionArn });
    }
}
