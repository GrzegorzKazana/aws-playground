import DynamoDB from 'aws-sdk/clients/dynamodb';
import SQS from 'aws-sdk/clients/sqs';
import { DynamoDBStreamHandler } from 'aws-lambda';
import { Queue } from 'sst/node/queue';
import { ProjectEntity } from '@21-sst-recipes/core/task-repository-dynamo';
import { isNotNullable } from '@21-sst-recipes/core/utils';

const sqs = new SQS({});

export const handler: DynamoDBStreamHandler = async (event, context) => {
    const projects = event.Records.map(record =>
        record.dynamodb && record.dynamodb.NewImage
            ? DynamoDB.Converter.unmarshall(record.dynamodb.NewImage)
            : null,
    )
        .filter(isNotNullable)
        .map(item => ProjectEntity.parse({ Item: item }).data)
        .filter(isNotNullable);

    const queueEntries = projects.map(project => ({
        Id: project.id,
        MessageBody: JSON.stringify(project),
    }));

    return sqs
        .sendMessageBatch({
            QueueUrl: Queue['project-archive-queue'].queueUrl,
            Entries: queueEntries,
        })
        .promise()
        .then(messagePosts => {
            if (messagePosts.Failed.length)
                console.error(`Failed to queue following messages:`, messagePosts.Failed);
        })
        .catch(err => console.error(`Failed to queue messages:`, err));
};
