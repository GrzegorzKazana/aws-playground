import { StackContext, Api, Table, Bucket, Queue, Stack, Script, Config } from 'sst/constructs';
import {
    Vpc,
    SubnetType,
    GatewayVpcEndpointAwsService,
    InterfaceVpcEndpointAwsService,
    InstanceType,
    InstanceClass,
    InstanceSize,
    SecurityGroup,
    Peer,
    Port,
} from 'aws-cdk-lib/aws-ec2';
import {
    DatabaseInstance,
    DatabaseInstanceEngine,
    PostgresEngineVersion,
    Credentials,
} from 'aws-cdk-lib/aws-rds';
import { Secret } from 'aws-cdk-lib/aws-secretsmanager';

export function API({ stack }: StackContext) {
    const vpc =
        stack.stage === 'prod'
            ? configureVpc(stack)
            : Vpc.fromLookup(stack, 'default-vpc', { isDefault: true });
    const dbSubnet = stack.stage === 'prod' ? SubnetType.PRIVATE_ISOLATED : SubnetType.PUBLIC;

    const table = new Table(stack, 'task-table', {
        primaryIndex: {
            partitionKey: 'pk',
            sortKey: 'sk',
        },
        fields: {
            pk: 'string',
            sk: 'string',
            lsi1sk: 'string',
            gsi1pk: 'string',
            gsi1sk: 'string',
        },
        localIndexes: {
            lsi1: { sortKey: 'lsi1sk' },
        },
        globalIndexes: {
            gsi1: {
                partitionKey: 'gsi1pk',
                sortKey: 'gsi1sk',
            },
        },
        stream: 'new_and_old_images',
        consumers: {
            projectFinishedListener: {
                function: 'packages/functions/src/archiverStreamListener.handler',
                filters: [
                    {
                        dynamodb: {
                            NewImage: { finishedDate: { S: [{ exists: true }] } },
                            OldImage: { finishedDate: { S: [{ exists: false }] } },
                        },
                    },
                ],
            },
        },
    });

    const rdsMasterSecret = new Secret(stack, 'rds-secret-master', {
        description: 'master user/passoword for rds instance',
        generateSecretString: {
            secretStringTemplate: JSON.stringify({ username: 'root' }),
            generateStringKey: 'password',
            excludeCharacters: '/@" ',
        },
    });

    const rdsSg = new SecurityGroup(stack, 'rds-sg', { vpc, allowAllOutbound: true });
    rdsSg.addIngressRule(Peer.anyIpv4(), Port.tcp(5432));

    // probably should use RDS Proxy as well if this was not just a toy project
    const rds = new DatabaseInstance(stack, 'task-table-rds', {
        engine: DatabaseInstanceEngine.postgres({ version: PostgresEngineVersion.VER_15_4 }),
        vpc,
        allocatedStorage: 20,
        instanceType: InstanceType.of(InstanceClass.T4G, InstanceSize.MICRO),
        credentials: Credentials.fromSecret(rdsMasterSecret),
        publiclyAccessible: true,
        iamAuthentication: true,
        securityGroups: [rdsSg],
        vpcSubnets: {
            subnetType: dbSubnet,
        },
    });

    const rdsParameters = Config.Parameter.create(stack, {
        AWS_REGION: stack.region,
        PGHOST: rds.dbInstanceEndpointAddress,
        APP_USERNAME: 'app',
        APP_DB_NAME: 'task_db',
    });

    const rdsInitializerScript = new Script(stack, 'rds-init', {
        onCreate: {
            handler: 'packages/functions/src/rds/init.handler',
            copyFiles: [{ from: 'packages/functions/src/rds/cert/eu-central-1-bundle.pem' }],
            environment: {
                PGHOST: rds.dbInstanceEndpointAddress,
                DB_CREDS_SECRETNAME: rdsMasterSecret.secretName,
                APP_USERNAME: rdsParameters.APP_USERNAME.value,
                APP_DB_NAME: rdsParameters.APP_DB_NAME.value,
            },
        },
    });

    rdsMasterSecret.grantRead(rdsInitializerScript.createFunction!);
    rdsInitializerScript.node.addDependency(rds, rdsMasterSecret);

    const rdsMigrationScript = new Script(stack, 'rds-migrate', {
        version: '1.4',
        onUpdate: {
            handler: 'packages/functions/src/rds/migrate.handler',
            copyFiles: [{ from: 'packages/functions/src/rds/cert/eu-central-1-bundle.pem' }],
            environment: {
                PGHOST: rds.dbInstanceEndpointAddress,
                APP_USERNAME: rdsParameters.APP_USERNAME.value,
                APP_DB_NAME: rdsParameters.APP_DB_NAME.value,
            },
        },
    });

    rds.grantConnect(rdsMigrationScript.updateFunction!, rdsParameters.APP_USERNAME.value);

    const projectArchiveBucket = new Bucket(stack, 'project-archive');
    const projectArchiveQueue = new Queue(stack, 'project-archive-queue', {
        consumer: {
            function: 'packages/functions/src/archiverQueueConsumer.handler',
        },
    });

    table.bindToConsumer('projectFinishedListener', [projectArchiveQueue]);
    projectArchiveQueue.bind([projectArchiveBucket, table, projectArchiveQueue]);

    const api = new Api(stack, 'api', {
        routes: {
            'ANY /{proxy+}': {
                function: {
                    handler: 'packages/functions/src/api.handler',
                    copyFiles: [
                        { from: 'packages/functions/src/rds/cert/eu-central-1-bundle.pem' },
                    ],
                    bind: [
                        table,
                        projectArchiveBucket,
                        rdsParameters.APP_DB_NAME,
                        rdsParameters.APP_USERNAME,
                        rdsParameters.PGHOST,
                    ],
                },
            },
        },
    });

    rds.grantConnect(api.getFunction('ANY /{proxy+}')!, rdsParameters.APP_USERNAME.value);

    stack.addOutputs({
        LambdaLogGroups: stack
            .getAllFunctions()
            .map(f => `\n\t${f.functionName}: ${f.logGroup.logGroupName}`)
            .join(''),
        ApiEndpoint: api.url,
        RDSEndpoint: rds.dbInstanceEndpointAddress,
    });

    return { rdsParameters, rds, rdsMasterSecret };
}

function configureVpc(stack: Stack) {
    const vpc = new Vpc(stack, 'prod-vpc', {
        // disable internet access from within the private subnet
        // (and save $ on not deploying NATs)
        natGateways: 0,
    });

    stack.setDefaultFunctionProps({
        vpc,
        vpcSubnets: {
            // see above
            subnetType: SubnetType.PRIVATE_ISOLATED,
        },
    });

    vpc.addGatewayEndpoint('dynamo-endpoint', { service: GatewayVpcEndpointAwsService.DYNAMODB });
    vpc.addGatewayEndpoint('s3-endpoint', { service: GatewayVpcEndpointAwsService.S3 });
    // warning: this is billed by the hour
    vpc.addInterfaceEndpoint('sqs-endpoint', { service: InterfaceVpcEndpointAwsService.SQS });
    vpc.addInterfaceEndpoint('rds-endpoint', { service: InterfaceVpcEndpointAwsService.RDS });

    return vpc;
}
