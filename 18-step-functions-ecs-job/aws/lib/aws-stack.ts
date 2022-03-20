import { Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as snsSubs from 'aws-cdk-lib/aws-sns-subscriptions';
import * as s3notifications from 'aws-cdk-lib/aws-s3-notifications';
import * as stepFn from 'aws-cdk-lib/aws-stepfunctions';
import * as stepFnTasks from 'aws-cdk-lib/aws-stepfunctions-tasks';

interface Props extends StackProps {
    notificationEmail: string;
}

export class AwsStack extends Stack {
    constructor(scope: Construct, id: string, props: Props) {
        super(scope, id, props);

        const inputBucket = new s3.Bucket(this, 'input-bucket');
        const outputBucket = new s3.Bucket(this, 'output-bucket');

        const uploadHandler = new lambda.Function(this, 'on-upload-function', {
            runtime: lambda.Runtime.NODEJS_14_X,
            code: lambda.Code.fromAsset('../app'),
            handler: 'upload.handler',
            environment: {
                // to be set below
                STATE_MACHINE_ARN: '',
            },
        });

        inputBucket.grantRead(uploadHandler);
        inputBucket.addObjectCreatedNotification(
            new s3notifications.LambdaDestination(uploadHandler),
        );

        const topic = new sns.Topic(this, 'notification-topic');

        topic.addSubscription(new snsSubs.EmailSubscription(props.notificationEmail));

        const cluster = new ecs.Cluster(this, 'cluster', {
            enableFargateCapacityProviders: true,
        });

        const taskRole = new iam.Role(this, 'task-role', {
            assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
        });

        inputBucket.grantRead(taskRole);
        outputBucket.grantPut(taskRole);

        const taskDefinition = new ecs.TaskDefinition(this, 'ecs-task', {
            compatibility: ecs.Compatibility.FARGATE,
            cpu: '256',
            memoryMiB: '512',
            taskRole,
        });

        const containerDefinition = taskDefinition.addContainer('container', {
            image: ecs.ContainerImage.fromRegistry('amazon/aws-cli'),
            entryPoint: ['sh', '-c'],
            command: ['echo "$TASK_SCRIPT" > script.sh && chmod +x script.sh && ./script.sh'],
            environment: {
                // yeah, I am too lazy to build my own image with the script baked into itself
                TASK_SCRIPT: `
                #! /bin/sh
                set -x
                set -e

                test -n "$INPUT_BUCKET_NAME"
                test -n "$OUTPUT_BUCKET_NAME"
                test -n "$BUCKET_KEY"

                aws s3 cp s3://$INPUT_BUCKET_NAME/$BUCKET_KEY input.txt

                # file processing
                sleep 30
                { cat input.txt; echo processed; } > output.txt

                aws s3 cp output.txt s3://$OUTPUT_BUCKET_NAME/$BUCKET_KEY
                `.trim(),
                // to be overwritten when running the task
                INPUT_BUCKET_NAME: '',
                OUTPUT_BUCKET_NAME: '',
                BUCKET_KEY: '',
            },
            logging: ecs.AwsLogDriver.awsLogs({ streamPrefix: 'task-18-task-def' }),
        });

        const startState = new stepFn.Pass(this, 'step-fn-start', {});
        const choiceState = new stepFn.Choice(this, 'step-fn-choice', {});
        const taskState = new stepFnTasks.EcsRunTask(this, 'step-fn-run-task', {
            cluster,
            launchTarget: new stepFnTasks.EcsFargateLaunchTarget(),
            taskDefinition,
            integrationPattern: stepFn.IntegrationPattern.RUN_JOB,
            containerOverrides: [
                {
                    containerDefinition,
                    environment: [
                        { name: 'OUTPUT_BUCKET_NAME', value: outputBucket.bucketName },
                        { name: 'INPUT_BUCKET_NAME', value: inputBucket.bucketName },
                        { name: 'BUCKET_KEY', value: stepFn.JsonPath.stringAt('$.key') },
                    ],
                },
            ],
            resultPath: '$.result',
        });
        const successNotificationState = new stepFnTasks.SnsPublish(this, 'step-fn-success', {
            topic,
            message: stepFn.TaskInput.fromObject({
                message: 'done',
                state: stepFn.JsonPath.entirePayload,
            }),
        });
        const noopNotificationState = new stepFnTasks.SnsPublish(this, 'step-fn-noop', {
            topic,
            message: stepFn.TaskInput.fromObject({
                message: 'done nothing',
                state: stepFn.JsonPath.entirePayload,
            }),
        });
        const errorNotificationState = new stepFnTasks.SnsPublish(this, 'step-fn-error', {
            topic,
            message: stepFn.TaskInput.fromObject({
                message: 'error',
                state: stepFn.JsonPath.entirePayload,
            }),
        });

        const definition = startState.next(
            choiceState
                .when(
                    stepFn.Condition.stringMatches('$.key', '*.txt'),
                    taskState
                        .addCatch(errorNotificationState, { resultPath: '$.error' })
                        .next(successNotificationState),
                )
                .otherwise(noopNotificationState),
        );

        const stateMachine = new stepFn.StateMachine(this, 'processing-step-fn', {
            stateMachineType: stepFn.StateMachineType.STANDARD,
            definition,
        });

        stateMachine.grantStartExecution(uploadHandler);
        uploadHandler.addEnvironment('STATE_MACHINE_ARN', stateMachine.stateMachineArn);
    }
}
