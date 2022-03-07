const { strict: assert } = require('assert');
const { DocumentClient } = require('aws-sdk/clients/dynamodb');
const SQS = require('aws-sdk/clients/sqs');
const ApiGatewayManagementApi = require('aws-sdk/clients/apigatewaymanagementapi');

const Repository = require('./repo.js');
const {
    groupBy,
    tryParseJson,
    prefixError,
    promiseSerial,
    postToConnectionWithCleanup,
} = require('./utils.js');

const { TABLE_NAME, AWS_REGION, QUEUE_URL, API_MANAGEMENT_URL } = process.env;

assert(TABLE_NAME);
assert(AWS_REGION);
assert(QUEUE_URL);
assert(API_MANAGEMENT_URL);

const client = new DocumentClient({ region: AWS_REGION });
const repo = new Repository(client, TABLE_NAME);
const api = new ApiGatewayManagementApi({ endpoint: API_MANAGEMENT_URL });
const queue = new SQS({ region: AWS_REGION });

/** @type {import('aws-lambda').SQSHandler} */
exports.wsQueueConsumer = async (event, _context) => {
    /** messages within a group need to be processed serially */
    const recordsPerGroup = groupBy(
        event.Records,
        ({ attributes }) => attributes.MessageGroupId || '',
    );

    const tasks = Object.values(recordsPerGroup).map(item =>
        processItemsWithinGroup(api, repo, item),
    );
    const results = await Promise.all(tasks);

    const unprocessed = results.flatMap(result => result.Failed);

    unprocessed.forEach(console.warn);

    return {
        batchItemFailures: unprocessed.map(({ Id }) => ({ itemIdentifier: Id })),
    };
};

/**
 * @param {import('aws-sdk').ApiGatewayManagementApi} api
 * @param {Repository} repo
 * @param {import('aws-lambda').SQSRecord[]} records
 * @returns {Promise<import('aws-sdk/clients/sqs').DeleteMessageBatchResult>}
 */
function processItemsWithinGroup(api, repo, records) {
    assert(QUEUE_URL);

    /** @type {{[K in keyof import('./models').QueueItemMap]: import('./models').ItemHandler<import('./models').QueueItemMap[K]>}} */
    const handlers = {
        join: processJoinItem,
        leave: processLeaveItem,
        postMessage: processPostMessageItem,
        disconnect: processDisconnectItem,
    };

    const handlerCallbacks = records.map(record => () => {
        const item = /** @type {import('./models').QueueItem} */ (tryParseJson(record.body));
        const handler =
            /** @type {import('./models').ItemHandler<import('./models').QueueItem>} */ (
                handlers[item.type]
            );

        return handler(api, repo, item).catch(err => {
            // repeated failure of specific item in group could cause whole group to halt
            // therefore we apply a catch-all approach and log the error
            // TODO: (improvement) handle that with dead-letter-queue (?)
            console.error(err);

            if (item.initiatorConnection && err instanceof Error) {
                const data = { type: 'error', message: err.message };

                postToConnectionWithCleanup(api, repo, item.initiatorConnection, data);
            }
        });
    });

    const deleteItems = () =>
        queue
            .deleteMessageBatch({
                QueueUrl: QUEUE_URL,
                Entries: records.map(record => ({
                    ReceiptHandle: record.receiptHandle,
                    Id: record.messageId,
                })),
            })
            .promise();

    return promiseSerial(handlerCallbacks).then(deleteItems);
}

/** @type {import('./models').ItemHandler<import('./models').JoinQueueItem>} */
async function processJoinItem(api, repo, item) {
    const {
        payload: { chat, name, connection },
    } = item;

    const { params } = await repo
        .join({ chat, name, connection })
        .catch(prefixError('Failed to join'));

    const { Items } = await repo
        .getLatestMessages(chat)
        .catch(prefixError('Failed to get latest messages'));

    const data = { type: 'joined', payload: { ...params, latest: Items } };

    return postToConnectionWithCleanup(api, repo, connection, data);
}
/** @type {import('./models').ItemHandler<import('./models').LeaveQueueItem>} */
async function processLeaveItem(api, repo, item) {
    const {
        payload: { chat, name, connection },
    } = item;

    const { params } = await repo.leave(chat, name).catch(prefixError('Failed to leave chat'));

    const data = { type: 'left', payload: params };

    return postToConnectionWithCleanup(api, repo, connection, data);
}
/** @type {import('./models').ItemHandler<import('./models').PostMessageQueueItem>} */
async function processPostMessageItem(api, repo, item) {
    const {
        payload: { chat, name, message },
    } = item;

    const { params } = await repo
        .postMessage({ author: name, chat, message })
        .catch(prefixError('Failed to save message'));

    const { Items: users } = await repo
        .getConnectedUsers(chat)
        .catch(prefixError('Failed to get active users'));

    const data = { type: 'message', payload: params };

    const posts = users.map(({ connection }) =>
        postToConnectionWithCleanup(api, repo, connection, data),
    );

    return Promise.all(posts);
}
/** @type {import('./models').ItemHandler<import('./models').DisconnectQueueItem>} */
function processDisconnectItem(api, repo, item) {
    const {
        payload: { connection },
    } = item;

    return repo.disconnect(connection).catch(prefixError('Failed to disconnect'));
}
