const { Table, Entity } = require('dynamodb-toolbox');

class Repository {
    /**
     * @param {import('aws-sdk/clients/dynamodb').DocumentClient} client
     * @param {string} tableName
     */
    constructor(client, tableName) {
        this.client = client;
        this.tableName = tableName;

        const table = new Table({
            DocumentClient: client,
            name: tableName,
            partitionKey: 'PK',
            sortKey: 'SK',
            indexes: {
                GSI1: { partitionKey: 'GSI1PK', sortKey: 'PK' },
            },
        });

        const Subscription = new Entity({
            name: 'Subscription',
            table,
            attributes: {
                PK: { partitionKey: true, default: ({ endpoint }) => `endpoint#${endpoint}` },
                SK: { sortKey: true, default: () => `METADATA` },
                GSI1PK: { default: ({ scope }) => `scope#${scope}` },

                scope: { type: 'string' },
                endpoint: { type: 'string' },
                subscription: { type: 'map' },
            },
        });

        this.table = table;
        this.Subscription = Subscription;
    }

    /**
     * @param {string} scope
     * @param {{endpoint: string; keys: {p256dh: string; auth: string}}} subscription
     */
    createSubscription(scope, subscription) {
        const params = {
            endpoint: subscription.endpoint,
            scope,
            subscription,
        };

        return this.Subscription.put(params).then(res => ({ ...res, params }));
    }

    /**
     * @param {string} endpoint
     */
    deleteSubscription(endpoint) {
        return this.Subscription.delete({ endpoint });
    }

    /**
     * @param {string} scope
     */
    getSubscriptionsOfScope(scope) {
        return this.Subscription.query(`scope#${scope}`, {
            index: 'GSI1',
            beginsWith: 'endpoint#',
        }).then(Repository.exhaustPagination);
    }

    static exhaustPagination(result) {
        return 'next' in result && typeof result.next === 'function'
            ? result
                  .next()
                  .then(Repository.exhaustPagination)
                  .then(subResult => ({
                      Items: [...result.Items, ...subResult.Items],
                      Count: result.Count + subResult.Count,
                      ScannedCount: result.ScannedCount + subResult.ScannedCount,
                  }))
            : Promise.resolve(result);
    }
}

module.exports = Repository;
