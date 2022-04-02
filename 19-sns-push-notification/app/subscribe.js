const { DocumentClient } = require('aws-sdk/clients/dynamodb');
const { strict: assert } = require('assert');

const Repository = require('./repo.js');

const { AWS_REGION, TABLE_NAME } = process.env;

assert(AWS_REGION);
assert(TABLE_NAME);

const client = new DocumentClient({ region: AWS_REGION });
const repo = new Repository(client, TABLE_NAME);

/** @type {import('aws-lambda').APIGatewayProxyHandlerV2} */
exports.post = async (event, _context) => {
    const { scope, subscription } = tryParse(event.body);

    const res = await repo.createSubscription(scope, subscription);

    return {
        statusCode: 200,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify(res),
    };
};

/** @type {import('aws-lambda').APIGatewayProxyHandlerV2} */
exports.delete = async (event, _context) => {
    const { endpoint } = event.pathParameters || {};

    if (!endpoint)
        return {
            statusCode: 400,
            body: JSON.stringify({ msg: 'missing endpoint path parameter' }),
            headers: { 'Access-Control-Allow-Origin': '*' },
        };

    const res = await repo.deleteSubscription(decodeURIComponent(endpoint));

    return {
        statusCode: 200,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify(res),
    };
};

function tryParse(a) {
    try {
        return JSON.parse(a);
    } catch {
        return {};
    }
}
