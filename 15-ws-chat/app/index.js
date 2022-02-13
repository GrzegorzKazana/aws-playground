const { strict: assert } = require('assert');
const { DocumentClient } = require('aws-sdk/clients/dynamodb');
const ApiGatewayManagementApi = require('aws-sdk/clients/apigatewaymanagementapi');

const Repository = require('./repo.js');

const { TABLE_NAME, AWS_REGION } = process.env;

assert(TABLE_NAME);
assert(AWS_REGION);

const client = new DocumentClient({ region: AWS_REGION });
const repo = new Repository(client, TABLE_NAME);

exports.join = withErrorHandling(async (event, _context) => {
    const { connectionId: connection } = event.requestContext;
    const body = tryParseJson(event.body);
    const { chat, name } = body.payload;

    if (!connection)
        return {
            statusCode: 500,
            body: 'Expected websocket connection does not contain connectionId, check the configuration',
        };
    if (!chat) return { statusCode: 400, body: 'You need to specify chat id' };
    if (!name) return { statusCode: 400, body: 'You need to specify username' };

    const { params } = await repo.join({ chat, name, connection }).catch(err =>
        Promise.reject({
            statusCode: 500,
            body: `Failed to join (${err instanceof Error ? err.message : ''})`,
        }),
    );

    const { Items } = await repo.getLatestMessages(chat).catch(err =>
        Promise.reject({
            statusCode: 500,
            body: `Failed to get latest messages (${err instanceof Error ? err.message : ''})`,
        }),
    );

    const data = { type: 'joined', payload: { ...params, latest: Items } };
    const api = new ApiGatewayManagementApi({
        endpoint: `${event.requestContext.domainName}/${event.requestContext.stage}`,
    });

    await postToConnectionWithCleanup(api, repo, connection, data);

    return {
        statusCode: 200,
        body: 'Successfully joined',
    };
});

exports.postMessage = withErrorHandling(async (event, _context) => {
    const { connectionId } = event.requestContext;
    const body = tryParseJson(event.body);
    const { chat, name, message } = body.payload;

    if (!connectionId)
        return {
            statusCode: 500,
            body: 'Expected websocket connection does not contain connectionId, check the configuration',
        };
    if (!chat) return { statusCode: 400, body: 'You need to specify chat id' };
    if (!name) return { statusCode: 400, body: 'You need to specify username' };
    if (!message) return { statusCode: 400, body: 'You need to specify message' };

    const { params } = await repo.postMessage({ author: name, chat, message }).catch(err =>
        Promise.reject({
            statusCode: 500,
            body: `Failed to save message (${err instanceof Error ? err.message : ''})`,
        }),
    );

    const { Items: users } = await repo.getConnectedUsers(chat).catch(err =>
        Promise.reject({
            statusCode: 500,
            body: `Failed to get active users (${err instanceof Error ? err.message : ''})`,
        }),
    );

    const data = { type: 'message', payload: params };
    const api = new ApiGatewayManagementApi({
        endpoint: `${event.requestContext.domainName}/${event.requestContext.stage}`,
    });

    const posts = users
        .filter(({ connection }) => connection !== connectionId)
        .map(({ connection }) => postToConnectionWithCleanup(api, repo, connection, data));

    await Promise.all(posts);

    return {
        statusCode: 200,
        body: 'Message posted',
    };
});

exports.leave = withErrorHandling(async (event, _context) => {
    const { connectionId: connection } = event.requestContext;
    const body = tryParseJson(event.body);
    const { chat, name } = body.payload;

    if (!connection)
        return {
            statusCode: 500,
            body: 'Expected websocket connection does not contain connectionId, check the configuration',
        };
    if (!chat) return { statusCode: 400, body: 'You need to specify chat id' };
    if (!name) return { statusCode: 400, body: 'You need to specify username' };

    const { params } = await repo.leave(chat, name).catch(err =>
        Promise.reject({
            statusCode: 500,
            body: `Failed to leave chat (${err instanceof Error ? err.message : ''})`,
        }),
    );

    const data = { type: 'left', payload: params };
    const api = new ApiGatewayManagementApi({
        endpoint: `${event.requestContext.domainName}/${event.requestContext.stage}`,
    });

    await postToConnectionWithCleanup(api, repo, connection, data);

    return {
        statusCode: 200,
        body: 'Left the chat',
    };
});

exports.disconnect = withErrorHandling(async (event, _context) => {
    const { connectionId: connection } = event.requestContext;

    if (!connection)
        return {
            statusCode: 500,
            body: 'Expected websocket disconnection does not contain connectionId, check the configuration',
        };

    await repo.disconnect(connection).catch(err =>
        Promise.reject({
            statusCode: 500,
            body: `Failed to disconnect ${err instanceof Error ? err.message : ''}`,
        }),
    );

    return {
        statusCode: 200,
        body: 'Disconnected',
    };
});

exports.default = withErrorHandling(async (_event, _context) => {
    return { statusCode: 400, body: 'Unknown route' };
});

function tryParseJson(item) {
    try {
        return JSON.parse(item);
    } catch {
        return {};
    }
}

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

/**
 * @param {import('aws-sdk').ApiGatewayManagementApi} api
 * @param {Repository} repo
 * @param {string} connectionId
 * @param {import('aws-sdk').ApiGatewayManagementApi.Data} data
 */
function postToConnectionWithCleanup(api, repo, connectionId, data) {
    return api
        .postToConnection({ ConnectionId: connectionId, Data: data })
        .promise()
        .catch(err =>
            // 410 means the client has already disconnected
            err.statusCode === 410
                ? repo
                      .disconnect(connectionId)
                      .then(() => Promise.resolve({ statusCode: 200, body: 'Connection gone' }))
                      .catch(err =>
                          Promise.reject({
                              statusCode: 500,
                              body: `Failed to clean up connection (${
                                  err instanceof Error ? err.message : ''
                              })`,
                          }),
                      )
                : Promise.reject({ statusCode: 500, body: 'Failed to post to connection' }),
        );
}
