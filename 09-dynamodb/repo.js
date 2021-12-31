const { randomUUID } = require('crypto');

class KanbanRepository {
    /**
     * @param {import('aws-sdk/clients/dynamodb').DocumentClient} client
     */
    constructor(client) {
        this.client = client;
        this.tableName = 'task09-kanban';
        this.dataSortKey = 'DATA';
        this.taskStatuses = {
            TODO: 'TODO',
            IN_PROGRESS: 'IN_PROGRESS',
            DONE: 'DONE',
        };
        // makes sure that items can be scattered between multiple partitions
        this.partitionScatterRange = 2;
        this.eventSortKeyPrefix = 'event#';
    }

    createTask(description) {
        return this.client
            .put({
                TableName: this.tableName,
                Item: {
                    TaskId: randomUUID(),
                    SK: this.dataSortKey,
                    CreatedAt: new Date().toISOString(),
                    Description: description,
                    Status: this.taskStatuses.TODO,
                    'GSI1-PK': this.generatePartitionedEntity(),
                },
            })
            .promise();
    }

    changeTaskStatus(taskId, status) {
        const eventCreatedAt = new Date().toISOString();

        return this.client
            .transactWrite({
                TransactItems: [
                    {
                        Update: {
                            TableName: this.tableName,
                            Key: {
                                TaskId: taskId,
                                SK: this.dataSortKey,
                            },
                            UpdateExpression: 'SET #status_field = :target_status',
                            ConditionExpression: `
                            (#status_field = :status_todo AND :target_status = :status_in_progress)
                                OR (#status_field = :status_in_progress AND :target_status = :status_done)`,
                            ExpressionAttributeNames: {
                                '#status_field': 'Status',
                            },
                            ExpressionAttributeValues: {
                                ':status_todo': this.taskStatuses.TODO,
                                ':status_in_progress': this.taskStatuses.IN_PROGRESS,
                                ':status_done': this.taskStatuses.DONE,
                                ':target_status': status,
                            },
                        },
                    },
                    {
                        Put: {
                            TableName: this.tableName,
                            Item: {
                                TaskId: taskId,
                                SK: `${this.eventSortKeyPrefix}${eventCreatedAt}`,
                                CreatedAt: eventCreatedAt,
                            },
                        },
                    },
                ],
            })
            .promise();
    }

    getTaskDetails(taskId) {
        return this.client
            .get({
                TableName: this.tableName,
                Key: {
                    TaskId: taskId,
                    SK: this.dataSortKey,
                },
            })
            .promise();
    }

    async getTasksInStatus(status) {
        const responses = await Promise.all(
            this.allPartitionedEntities().map(partition =>
                this.client
                    .query({
                        TableName: this.tableName,
                        IndexName: 'GSI1',
                        KeyConditionExpression: `#pk_field = :partition AND #status_field = :target_status`,
                        ExpressionAttributeNames: {
                            '#pk_field': 'GSI1-PK',
                            '#status_field': 'Status',
                        },
                        ExpressionAttributeValues: {
                            ':partition': partition,
                            ':target_status': status,
                        },
                    })
                    .promise(),
            ),
        );

        return responses
            .flatMap(({ Items }) => Items)
            .sort(({ createdAt: a }, { createdAt: b }) => a < b);
    }

    async getTasks() {
        const responses = await Promise.all(
            this.allPartitionedEntities().map(partition =>
                this.client
                    .query({
                        TableName: this.tableName,
                        IndexName: 'GSI1',
                        KeyConditionExpression: `#pk_field = :partition`,
                        ExpressionAttributeNames: {
                            '#pk_field': 'GSI1-PK',
                        },
                        ExpressionAttributeValues: {
                            ':partition': partition,
                        },
                    })
                    .promise(),
            ),
        );

        return responses
            .flatMap(({ Items }) => Items)
            .sort(({ createdAt: a }, { createdAt: b }) => a < b);
    }

    getTaskEvents(taskId) {
        return this.client
            .query({
                TableName: this.tableName,
                KeyConditionExpression: `#pk_field = :task_id AND begins_with(#sk_field, :sk_prefix)`,
                ExpressionAttributeNames: {
                    '#pk_field': 'TaskId',
                    '#sk_field': 'SK',
                },
                ExpressionAttributeValues: {
                    ':task_id': taskId,
                    ':sk_prefix': this.eventSortKeyPrefix,
                },
            })
            .promise();
    }

    deleteTask(taskId) {
        return this.client
            .delete({
                TableName: this.tableName,
                Key: {
                    TaskId: taskId,
                    SK: this.dataSortKey,
                },
            })
            .promise();
    }

    generatePartitionedEntity() {
        const partition = Math.floor(Math.random() * this.partitionScatterRange);

        return `TASK-${partition}`;
    }
    allPartitionedEntities() {
        return [...new Array(this.partitionScatterRange).keys()].map(index => `TASK-${index}`);
    }
}

module.exports = KanbanRepository;
