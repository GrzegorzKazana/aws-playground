const { DocumentClient } = require('aws-sdk/clients/dynamodb');
const SecretsManager = require('aws-sdk/clients/secretsmanager');
const { strict: assert } = require('assert');
const webpush = require('web-push');

const Repository = require('./repo.js');

const { AWS_REGION, TABLE_NAME, VAPID_SECRET_ARN } = process.env;

assert(AWS_REGION);
assert(TABLE_NAME);
assert(VAPID_SECRET_ARN);

const client = new DocumentClient({ region: AWS_REGION });
const repo = new Repository(client, TABLE_NAME);
const secrets = new SecretsManager({ region: AWS_REGION });

const vapidInitializedPromise = secrets
    .getSecretValue({ SecretId: VAPID_SECRET_ARN })
    .promise()
    .then(secret => tryParse(secret.SecretString))
    .then(keys =>
        keys &&
        typeof keys === 'object' &&
        typeof keys.email === 'string' &&
        typeof keys.public === 'string' &&
        typeof keys.private === 'string'
            ? Promise.resolve(webpush.setVapidDetails(keys.email, keys.public, keys.private))
            : Promise.reject(new Error('Missing or invalid VAPID credentials')),
    );

/** @type {import('aws-lambda').SNSHandler} */
exports.handler = async (event, _context) => {
    const messagesByScope = groupBy(event.Records, r =>
        r.Sns.MessageAttributes.scope ? r.Sns.MessageAttributes.scope.Value : 'MISSING_SCOPE',
    );

    const { MISSING_SCOPE, ...restMessages } = messagesByScope;

    // or use dead letter queue...
    if (messagesByScope.MISSING_SCOPE)
        console.warn('Unprocessed message due to missing scope attribute');

    await vapidInitializedPromise;

    const scopeProcesses = Object.entries(restMessages).map(([scope, records]) =>
        processScope(scope, records),
    );
    const scopeResults = await Promise.all(scopeProcesses).then(results => ({
        errors: results.flatMap(r => r.errors),
        successes: results.flatMap(r => r.successes),
    }));

    if (scopeResults.errors.length) console.warn('Notification warn errors:', scopeResults.errors);
};

/**
 * @param {string} scope
 * @param {import('aws-lambda').SNSEventRecord[]} records
 */
async function processScope(scope, records) {
    const subscriptions = await repo.getSubscriptionsOfScope(scope);

    const subscriptionDetails = subscriptions.Items.map(item => item.subscription);
    const pushes = records.flatMap(record =>
        subscriptionDetails.map(subscription =>
            webpush.sendNotification(subscription, record.Sns.Message).catch(
                /** @param {import('web-push').WebPushError} err */ err =>
                    // in case client already unsubscribed (410 GONE)
                    // clean up the record in the database
                    err.statusCode === 410
                        ? repo.deleteSubscription(subscription.endpoint)
                        : Promise.reject(err),
            ),
        ),
    );

    const results = await Promise.allSettled(pushes);

    const successes = results
        .map(result => (result.status === 'fulfilled' ? result.value : null))
        .filter(Boolean);
    const errors = results
        .map(result => (result.status === 'rejected' ? result.reason : null))
        .filter(Boolean);

    return { successes, errors };
}

/**
 * @template T
 * @param {T[]} a
 * @param {(a: T) => string} cb
 * @returns {Record<string, T[]>}
 */
function groupBy(a, cb) {
    return a.reduce((acc, item) => {
        const key = cb(item);

        if (!acc[key]) acc[key] = [];
        acc[key].push(item);

        return acc;
    }, {});
}

function tryParse(a) {
    try {
        return JSON.parse(a);
    } catch {
        return {};
    }
}
