const { DocumentClient } = require('aws-sdk/clients/dynamodb');

const Repository = require('./repo');

const client = new DocumentClient({
    region: process.env.AWS_REGION,
    endpoint: process.env.DYNAMODB_ENDPOINT || undefined,
});
const repo = new Repository(client);

/** @type {import('aws-lambda').DynamoDBStreamHandler} */
exports.handler = (event, _context) => {
    const keys = event.Records.filter(isModify).map(extractKeysFromRecord).filter(isUserItem);
    const uniqKeys = dedupeKeys(keys);

    const requests = uniqKeys.map(toUserId).map(userId => repo.updateItemsReferencingUser(userId));

    return Promise.allSettled(requests).then(items => {
        const failed = items.filter(({ status }) => status === 'rejected');
        if (failed.length === 0) return;

        console.error(`Failed to update info about users`, failed);
    });
};

/** @param {import('aws-lambda').DynamoDBRecord} */
function isModify({ eventName }) {
    return eventName === 'MODIFY';
}

function isUserItem({ PK, SK }) {
    return PK.startsWith('user#') && SK === 'METADATA';
}

function toUserId({ PK }) {
    return PK.split('user#')[1];
}

/** @param {import('aws-lambda').DynamoDBRecord} */
function extractKeysFromRecord({ dynamodb }) {
    if (!dynamodb) return null;

    const { PK, SK } = dynamodb.Keys || {};

    return PK && SK && PK.S && SK.S ? { PK: PK.S, SK: SK.S } : null;
}

function dedupeKeys(arr) {
    const keyRecord = arr.reduce((acc, { PK, SK }) => {
        if (PK in acc && SK in acc[PK]) return acc;

        acc[PK] = acc[PK] || {};
        acc[PK][SK] = true;

        return acc;
    }, {});

    return Object.entries(keyRecord).flatMap(([PK, skRecord]) =>
        Object.keys(skRecord).map(SK => ({ PK, SK })),
    );
}
