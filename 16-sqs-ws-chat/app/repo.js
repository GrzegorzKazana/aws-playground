const { ulid } = require('ulid');
const { Table, Entity } = require('dynamodb-toolbox');

/**
 * @typedef {{ chat: string, name: string, connection: string }} ChatUserInput
 * @typedef {ChatUserInput & { timestamp: number }} ChatUserAttrs
 * @typedef {ChatUserAttrs & { PK: string, SK: string, GSI1PK: string }} ChatUser
 */

/**
 * @typedef {{ chat: string, author: string, message: string }} MessageInput
 * @typedef {MessageInput & { id: string, timestamp: number }} MessageAttrs
 * @typedef {ChatUserAttrs & { PK: string, SK: string }} Message
 */

class Repository {
    /**
     * @param {import('aws-sdk/clients/dynamodb').DocumentClient} client
     * @param {string} tableName
     */
    constructor(client, tableName) {
        const { table, Message, ChatUser } = Repository.buildEntities(client, tableName);

        this.table = table;
        this.Message = Message;
        this.ChatUser = ChatUser;
    }

    /** @param {ChatUserInput} input */
    join(input) {
        /** @type {ChatUserAttrs} */
        const params = { ...input, timestamp: Date.now() };

        return this.ChatUser.put(params).then(res => ({ ...res, params }));
    }

    /** @param {MessageInput} input */
    postMessage(input) {
        const timestamp = Date.now();
        const id = ulid(timestamp);

        /** @type {MessageAttrs} */
        const params = { ...input, id, timestamp };

        return this.Message.put(params).then(res => ({ ...res, params }));
    }

    /** @param {string} chat */
    getLatestMessages(chat) {
        return this.Message.query(`chat#${chat}`, {
            limit: 10,
            reverse: true,
            beginsWith: 'message#',
        });
    }

    /** @param {string} chat */
    getConnectedUsers(chat) {
        return this.ChatUser.query(`chat#${chat}`, { beginsWith: 'user#' });
    }

    /**
     * @param {string} chat
     * @param {string} user
     */
    leave(chat, user) {
        return this.ChatUser.delete({ name: user, chat });
    }

    /**
     * @param {string} connection
     */
    async disconnect(connection) {
        /** @type {{Items: Array<ChatUser>}} */
        const { Items } = await this.ChatUser.query(`connection#${connection}`, { index: 'GSI1' });

        if (Items.length === 0) return;

        const deleteRequests = Repository.batch(25, Items).map(batch =>
            this.table.batchWrite(batch.map(item => this.ChatUser.deleteBatch(item))),
        );

        return Promise.all(deleteRequests.map(Repository.exhaustUnprocessedKeys));
    }

    /**
     * @param {import('aws-sdk/clients/dynamodb').DocumentClient} client
     * @param {string} tableName
     */
    static buildEntities(client, tableName) {
        const table = new Table({
            DocumentClient: client,
            name: tableName,
            partitionKey: 'PK',
            sortKey: 'SK',
            indexes: {
                GSI1: { partitionKey: 'GSI1PK', sortKey: 'PK' },
            },
        });

        const Message = new Entity({
            table,
            name: 'message',
            attributes: {
                PK: { partitionKey: true, default: ({ chat }) => `chat#${chat}` },
                SK: { sortKey: true, default: ({ id }) => `message#${id}` },

                id: { type: 'string', required: true },
                chat: { type: 'string', required: true },
                author: { type: 'string', required: true },
                timestamp: { type: 'number', required: true },
                message: { type: 'string', required: true },
            },
        });

        const ChatUser = new Entity({
            table,
            name: 'user',
            attributes: {
                PK: { partitionKey: true, default: ({ chat }) => `chat#${chat}` },
                SK: { sortKey: true, default: ({ name }) => `user#${name}` },
                GSI1PK: { default: ({ connection }) => `connection#${connection}` },

                name: { type: 'string', required: true },
                chat: { type: 'string', required: true },
                timestamp: { type: 'number', required: true },
                connection: { type: 'string', required: true },
            },
        });

        return { table, Message, ChatUser };
    }

    /**
     * @template T
     * @param {number} n
     * @param {T[]} arr
     * @returns {T[][]}
     */
    static batch(n, arr) {
        const numOfBatches = Math.ceil(arr.length / n);

        return [...new Array(numOfBatches).keys()].map(batchN =>
            arr.slice(batchN * n, (batchN + 1) * n),
        );
    }

    /**
     * @typedef {Promise<{UnprocessedItems?: unknown[], next: () => Req}>} Req
     * @param {Req} req
     * @param {number=} depth
     */
    static exhaustUnprocessedKeys(req, depth = 1) {
        return req.then(res =>
            res.UnprocessedItems &&
            typeof res.UnprocessedItems === 'object' &&
            Object.keys(res.UnprocessedItems).length
                ? // add simple exponential back off
                  // https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Programming.Errors.html#Programming.Errors.RetryAndBackoff
                  Repository.wait(100 * Math.pow(2, depth)).then(() =>
                      Repository.exhaustUnprocessedKeys(res.next(), depth + 1),
                  )
                : res,
        );
    }

    /** @param {number} milliseconds */
    static wait(milliseconds) {
        return new Promise(res => setTimeout(res, milliseconds));
    }
}

module.exports = Repository;
