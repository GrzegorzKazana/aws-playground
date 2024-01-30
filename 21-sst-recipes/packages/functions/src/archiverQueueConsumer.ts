import DynamoDB from 'aws-sdk/clients/dynamodb';
import S3 from 'aws-sdk/clients/s3';
import SQS from 'aws-sdk/clients/sqs';
import { SQSHandler, SQSRecord } from 'aws-lambda';
import { Table } from 'sst/node/table';
import { Bucket } from 'sst/node/bucket';
import { TaskRepository, Project } from '@21-sst-recipes/core/task-repository';
import { partitionPromiseSettled } from '@21-sst-recipes/core/utils';
import { Queue } from 'sst/node/queue';

const repo = new TaskRepository(new DynamoDB.DocumentClient(), Table['task-table'].tableName);
const bucket = new S3({});
const sqs = new SQS({});

export const handler: SQSHandler = async (event, context) => {
    const processedRecords = await Promise.allSettled(event.Records.map(processRecord));

    const { fulfilled: handledRecords, rejected: failedRecords } =
        partitionPromiseSettled(processedRecords);

    if (failedRecords.length)
        console.error(`Failed to save following project archives due to errors:`, failedRecords);

    return sqs
        .deleteMessageBatch({
            QueueUrl: Queue['project-archive-queue'].queueUrl,
            Entries: handledRecords.map(record => ({
                ReceiptHandle: record.receiptHandle,
                Id: record.messageId,
            })),
        })
        .promise()
        .then(result => {
            if (result.Failed.length)
                console.error(`Failed to remove following projects from queue: `, result.Failed);
        })
        .catch(err => console.error(`Failed to remove archived projects from queue:`, err));
};

function processRecord(record: SQSRecord) {
    // TODO: add some validation
    const project = JSON.parse(record.body);

    return createArchiveItem(project)
        .then(uploadItem)
        .then(() => record);
}

async function createArchiveItem(project: Project) {
    const path = `projects/${project.id}.json`;
    const tasks = await repo.getTasks(project.id);
    const employees = await repo.getEmployees({ project: project.id });

    return { path, item: { ...project, tasks, employees } };
}

function uploadItem({ path, item }: { path: string; item: Record<string, unknown> }) {
    return bucket
        .putObject({
            Bucket: Bucket['project-archive'].bucketName,
            Key: path,
            Body: JSON.stringify(item),
        })
        .promise();
}
