import { StackContext } from 'sst/constructs';
import {
    GatewayVpcEndpointAwsService,
    InterfaceVpcEndpointAwsService,
    SubnetType,
    Vpc,
    Port,
} from 'aws-cdk-lib/aws-ec2';
import {
    Cluster,
    FargateService,
    TaskDefinition,
    Compatibility,
    AwsLogDriver,
    ContainerImage,
} from 'aws-cdk-lib/aws-ecs';
import {
    ApplicationLoadBalancer,
    ListenerAction,
    ListenerCondition,
} from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import { LogGroup, LogRetention } from 'aws-cdk-lib/aws-logs';
import { Platform } from 'aws-cdk-lib/aws-ecr-assets';
import { Duration, Size } from 'aws-cdk-lib/core';

export function API({ stack }: StackContext) {
    const vpc = new Vpc(stack, 'vpc', {
        // disable internet access from within the private subnet
        // (and save $ on not deploying NATs)
        // (or actually spend more by creating vpc endpoints...)
        natGateways: 0,
    });

    vpc.addGatewayEndpoint('s2', { service: GatewayVpcEndpointAwsService.S3 });
    vpc.addInterfaceEndpoint('ecr', { service: InterfaceVpcEndpointAwsService.ECR });
    vpc.addInterfaceEndpoint('ecr-dkr', { service: InterfaceVpcEndpointAwsService.ECR_DOCKER });
    vpc.addInterfaceEndpoint('cw-logs', {
        service: InterfaceVpcEndpointAwsService.CLOUDWATCH_LOGS,
    });

    // used for service dns resolution (service connect)
    const serviceConnectNamespace = 'local';

    const cluster = new Cluster(stack, 'cluster', {
        vpc,
        defaultCloudMapNamespace: {
            vpc,
            name: serviceConnectNamespace,
            useForServiceConnect: true,
        },
    });

    const alb = new ApplicationLoadBalancer(stack, 'app-load-balancer', {
        vpc,
        internetFacing: true,
    });

    const listener = alb.addListener('http-listener', { port: 80 });

    const logGroup = new LogRetention(stack, 'log-retention', {
        logGroupName: `/sst/service/cluster`,
        retention: 3,
    });

    const {
        service: appService,
        appHostName,
        appPort,
    } = createAppService(stack, 'a', {
        logGroupArn: logGroup.logGroupArn,
        cluster,
        serviceConnectNamespace,
    });

    const { service: proxyServiceA } = createProxyService(stack, 'app-proxy-a', {
        logGroupArn: logGroup.logGroupArn,
        cluster,
        serviceConnectNamespace,
        appHostName: `${appHostName}.${serviceConnectNamespace}`,
        appPort,
    });

    const { service: proxyServiceB } = createProxyService(stack, 'app-proxy-b', {
        logGroupArn: logGroup.logGroupArn,
        cluster,
        serviceConnectNamespace,
        appHostName: `${appHostName}.${serviceConnectNamespace}`,
        appPort,
    });

    // by default, services in private subnets have no ingress rules
    appService.connections.allowFrom(proxyServiceA, Port.tcp(appPort));
    appService.connections.allowFrom(proxyServiceB, Port.tcp(appPort));

    // default action (no conditions)
    listener.addAction('forbid-root-path', {
        action: ListenerAction.fixedResponse(400, {
            contentType: 'application/json',
            messageBody: JSON.stringify({ message: 'root path requests not allowed' }),
        }),
    });

    listener.addTargets('app-proxy-a', {
        priority: 10,
        port: 80,
        targets: [proxyServiceA],
        conditions: [ListenerCondition.pathPatterns(['/a/*'])],
        healthCheck: {
            healthyThresholdCount: 2,
            interval: Duration.seconds(10),
            timeout: Duration.seconds(5),
            path: '/health',
        },
        deregistrationDelay: Duration.seconds(5),
    });

    listener.addTargets('app-proxy-b', {
        priority: 11,
        port: 80,
        targets: [proxyServiceB],
        conditions: [ListenerCondition.pathPatterns(['/b/*'])],
        healthCheck: {
            healthyThresholdCount: 2,
            interval: Duration.seconds(10),
            timeout: Duration.seconds(5),
            path: '/health',
        },
        deregistrationDelay: Duration.seconds(5),
    });

    stack.addOutputs({
        ApiEndpoint: alb.loadBalancerDnsName,
    });
}

function createAppService(
    stack: StackContext['stack'],
    name: string,
    {
        logGroupArn,
        cluster,
        serviceConnectNamespace,
    }: {
        logGroupArn: string;
        cluster: Cluster;
        serviceConnectNamespace: string;
    },
) {
    const appHostName = `service-${name}-default-port`;
    const appPort = 9090;
    const image = ContainerImage.fromAsset('./app', { platform: Platform.LINUX_AMD64 });
    const task = new TaskDefinition(stack, `task-${name}`, {
        compatibility: Compatibility.FARGATE,
        cpu: '256',
        memoryMiB: '512',
    });
    const container = task.addContainer('app', {
        image: image,
        logging: new AwsLogDriver({
            logGroup: LogGroup.fromLogGroupArn(stack, 'log-group', logGroupArn),
            streamPrefix: 'service',
        }),
        portMappings: [{ containerPort: appPort, name: appHostName }],
        environment: {
            SERVICE_ID: name,
        },
        healthCheck: {
            // https://stackoverflow.com/a/47722899
            command: [
                'CMD-SHELL',
                `wget --no-verbose --tries=1 --spider http://localhost:${appPort}/ || exit 1`,
            ],
        },
    });

    const service = new FargateService(stack, `service-${name}`, {
        cluster,
        vpcSubnets: { subnetType: SubnetType.PRIVATE_ISOLATED },
        taskDefinition: task,
        assignPublicIp: false,
        enableExecuteCommand: true,
        // https://docs.aws.amazon.com/AmazonECS/latest/developerguide/service-connect.html
        // https://docs.aws.amazon.com/AmazonECS/latest/developerguide/service_definition_parameters.html#Service-serviceConnectConfiguration
        serviceConnectConfiguration: {
            // as a server service, need to join the namespace
            // and expose a port
            namespace: serviceConnectNamespace,
            services: [{ portMappingName: appHostName }],
        },
    });

    const scaling = service.autoScaleTaskCount({
        minCapacity: 1,
        maxCapacity: 1,
    });
    scaling.scaleOnCpuUtilization('CpuScaling', {
        targetUtilizationPercent: 80,
        scaleOutCooldown: Duration.seconds(30),
    });
    scaling.scaleOnMemoryUtilization('MemoryScaling', {
        targetUtilizationPercent: 80,
        scaleOutCooldown: Duration.seconds(30),
    });

    return { service, appHostName, appPort };
}

function createProxyService(
    stack: StackContext['stack'],
    name: string,
    {
        logGroupArn,
        cluster,
        serviceConnectNamespace,
        appHostName,
        appPort,
    }: {
        logGroupArn: string;
        cluster: Cluster;
        serviceConnectNamespace: string;
        appHostName: string;
        appPort: number;
    },
) {
    const image = ContainerImage.fromAsset('./proxy', { platform: Platform.LINUX_AMD64 });
    const task = new TaskDefinition(stack, `task-${name}`, {
        compatibility: Compatibility.FARGATE,
        cpu: '256',
        memoryMiB: '512',
    });
    const container = task.addContainer('app', {
        image: image,
        logging: new AwsLogDriver({
            logGroup: LogGroup.fromLogGroupArn(stack, `log-group-proxy-${name}`, logGroupArn),
            streamPrefix: 'service',
        }),
        portMappings: [{ containerPort: 9090, name: `service-${name}-default-port` }],
        environment: {
            SERVICE_ID: name,
            APP_PORT: String(appPort),
            APP_HOST: appHostName,
        },
        healthCheck: {
            // https://stackoverflow.com/a/47722899
            command: [
                'CMD-SHELL',
                'wget --no-verbose --tries=1 --spider http://localhost:9090/health || exit 1',
            ],
        },
    });
    const service = new FargateService(stack, `service-${name}`, {
        cluster,
        vpcSubnets: { subnetType: SubnetType.PUBLIC },
        taskDefinition: task,
        assignPublicIp: true,
        enableExecuteCommand: true,
        // https://docs.aws.amazon.com/AmazonECS/latest/developerguide/service-connect.html
        // https://docs.aws.amazon.com/AmazonECS/latest/developerguide/service_definition_parameters.html#Service-serviceConnectConfiguration
        serviceConnectConfiguration: {
            // as a client service, only need to join the namespace
            namespace: serviceConnectNamespace,
        },
    });

    const scaling = service.autoScaleTaskCount({
        minCapacity: 1,
        maxCapacity: 1,
    });
    scaling.scaleOnCpuUtilization('CpuScaling', {
        targetUtilizationPercent: 80,
        scaleOutCooldown: Duration.seconds(30),
    });
    scaling.scaleOnMemoryUtilization('MemoryScaling', {
        targetUtilizationPercent: 80,
        scaleOutCooldown: Duration.seconds(30),
    });

    return { service };
}
