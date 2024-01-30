import { StackContext, Api, Table, Bucket, Queue, Config } from 'sst/constructs';

export function API({ stack }: StackContext) {
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
                    bind: [table, projectArchiveBucket],
                },
            },
        },
    });

    stack.addOutputs({
        ApiEndpoint: api.url,
    });
}
