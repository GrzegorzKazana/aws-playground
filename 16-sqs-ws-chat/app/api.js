const { strict: assert } = require('assert');
const SQS = require('aws-sdk/clients/sqs');

const { tryParseJson, isString, isObject } = require('./utils');

const { AWS_REGION, QUEUE_URL } = process.env;

assert(QUEUE_URL);

const globalChatGroup = 'ChatGroup#0';
const queue = new SQS({ region: AWS_REGION });

exports.join = withErrorHandling(async (event, _context) => {
    const { connectionId: connection, requestId } = event.requestContext;
    const body = tryParseJson(event.body || '');

    if (!isString(connection))
        return {
            statusCode: 500,
            body: 'Expected websocket connection does not contain connectionId, check the configuration',
        };

    if (!isObject(body) || !isObject(body.payload))
        return { statusCode: 400, body: 'You need to specify message body and payload' };

    const { chat, name } = body.payload;

    if (!isString(chat)) return { statusCode: 400, body: 'You need to specify chat id' };
    if (!isString(name)) return { statusCode: 400, body: 'You need to specify username' };

    /** @type {import('./models').JoinQueueItem} */
    const queueItem = {
        type: 'join',
        payload: { chat, name, connection },
        initiatorConnection: connection,
    };

    const _ = await queue
        .sendMessage({
            QueueUrl: QUEUE_URL,
            MessageBody: JSON.stringify(queueItem),
            MessageGroupId: chat,
            MessageDeduplicationId: requestId,
        })
        .promise();

    return {
        statusCode: 200,
        body: 'Successfully joined',
    };
});

exports.postMessage = withErrorHandling(async (event, _context) => {
    const { connectionId: connection, requestId } = event.requestContext;
    const body = tryParseJson(event.body || '');

    if (!isString(connection))
        return {
            statusCode: 500,
            body: 'Expected websocket connection does not contain connectionId, check the configuration',
        };

    if (!isObject(body) || !isObject(body.payload))
        return { statusCode: 400, body: 'You need to specify message body and payload' };

    const { chat, name, message } = body.payload;

    if (!isString(chat)) return { statusCode: 400, body: 'You need to specify chat id' };
    if (!isString(name)) return { statusCode: 400, body: 'You need to specify username' };
    if (!isString(message)) return { statusCode: 400, body: 'You need to specify message' };

    /** @type {import('./models').PostMessageQueueItem} */
    const queueItem = {
        type: 'postMessage',
        payload: { chat, name, message },
        initiatorConnection: connection,
    };

    const _ = await queue
        .sendMessage({
            QueueUrl: QUEUE_URL,
            MessageBody: JSON.stringify(queueItem),
            MessageGroupId: chat,
            MessageDeduplicationId: requestId,
        })
        .promise();

    return {
        statusCode: 200,
        body: 'Message posted',
    };
});

exports.leave = withErrorHandling(async (event, _context) => {
    const { connectionId: connection, requestId } = event.requestContext;
    const body = tryParseJson(event.body || '');

    if (!isString(connection))
        return {
            statusCode: 500,
            body: 'Expected websocket connection does not contain connectionId, check the configuration',
        };

    if (!isObject(body) || !isObject(body.payload))
        return { statusCode: 400, body: 'You need to specify message body and payload' };

    const { chat, name } = body.payload;

    if (!isString(chat)) return { statusCode: 400, body: 'You need to specify chat id' };
    if (!isString(name)) return { statusCode: 400, body: 'You need to specify username' };

    /** @type {import('./models').LeaveQueueItem} */
    const queueItem = {
        type: 'leave',
        payload: { chat, name, connection },
        initiatorConnection: connection,
    };

    const _ = await queue
        .sendMessage({
            QueueUrl: QUEUE_URL,
            MessageBody: JSON.stringify(queueItem),
            MessageGroupId: chat,
            MessageDeduplicationId: requestId,
        })
        .promise();

    return {
        statusCode: 200,
        body: 'Left the chat',
    };
});

exports.disconnect = withErrorHandling(async (event, _context) => {
    const { connectionId: connection, requestId } = event.requestContext;

    if (!isString(connection))
        return {
            statusCode: 500,
            body: 'Expected websocket disconnection does not contain connectionId, check the configuration',
        };

    /** @type {import('./models').DisconnectQueueItem} */
    const queueItem = {
        type: 'disconnect',
        payload: { connection },
        initiatorConnection: connection,
    };

    const _ = await queue
        .sendMessage({
            QueueUrl: QUEUE_URL,
            MessageBody: JSON.stringify(queueItem),
            MessageGroupId: globalChatGroup,
            MessageDeduplicationId: requestId,
        })
        .promise();

    return {
        statusCode: 200,
        body: 'Disconnected',
    };
});

exports.default = withErrorHandling(async (_event, _context) => {
    return { statusCode: 400, body: 'Unknown route' };
});

/**
 * @param {(event: import('aws-lambda').APIGatewayProxyEvent, context: import('aws-lambda').Context) => Promise<import('aws-lambda').APIGatewayProxyResult>} fn
 * @return {import('aws-lambda').APIGatewayProxyHandler}
 */
function withErrorHandling(fn) {
    return (event, context) =>
        fn(event, context).catch(err =>
            err.statusCode && err.body
                ? err
                : {
                      statusCode: 500,
                      body: `Lambda execution failed (${err instanceof Error ? err.message : ''})`,
                  },
        );
}
