const { randomUUID } = require('crypto');
const { Table, Entity } = require('dynamodb-toolbox');

class Repository {
    /**
     * @param {import('aws-sdk/clients/dynamodb').DocumentClient} client
     */
    constructor(client) {
        this.client = client;
        const { table, User, Post, Comment } = Repository.buildEntities(client);

        this.table = table;
        this.User = User;
        this.Post = Post;
        this.Comment = Comment;
    }

    createUser(firstName, secondName, email) {
        const id = randomUUID();
        const params = {
            id,
            email,
            firstName,
            secondName,
        };

        return this.User.put(params).then(res => ({ ...res, id, params }));
    }

    createPost(userId, content) {
        const id = randomUUID();

        return this.Post.put({
            id,
            userId,
            content,
        }).then(res => ({ ...res, id }));
    }

    createComment(postId, user, text) {
        const id = randomUUID();

        return this.Comment.put({
            id,
            text,
            postId,
            userId: user.id,
            user,
        }).then(res => ({ ...res, id }));
    }

    getUserInfo(userId) {
        return this.User.get({ id: userId });
    }

    getUserPosts(userId) {
        return this.User.query(`user#${userId}`, { beginsWith: 'post#' });
    }

    getPostComments(postId) {
        return this.Comment.query(`post#${postId}`, { beginsWith: 'comment#' });
    }

    getItemsReferencingUser(userId) {
        return this.table.query(userId, { index: 'user-reference-index' });
    }

    updateUserEmail(userId, email) {
        return this.User.update({
            id: userId,
            email,
        });
    }

    async updateItemsReferencingUser(userId) {
        const [
            { Items: items },
            {
                Item: { id, firstName, secondName, email },
            },
        ] = await Promise.all([this.getItemsReferencingUser(userId), this.getUserInfo(userId)]);

        const user = { id, firstName, secondName, email };

        const updates = batch(25, items).map(batch =>
            this.table.transactWrite(
                batch.map(({ PK, SK }) => ({
                    Update: {
                        TableName: this.table.name,
                        Key: { PK, SK },
                        UpdateExpression: 'SET #user_field = :user_value',
                        ExpressionAttributeNames: { '#user_field': 'user' },
                        ExpressionAttributeValues: { ':user_value': user },
                    },
                })),
            ),
        );

        return Promise.all(updates);
    }

    /**
     * @param {import('aws-sdk/clients/dynamodb').DocumentClient} client
     */
    static buildEntities(client) {
        const table = new Table({
            DocumentClient: client,
            name: 'posts-table',
            partitionKey: 'PK',
            sortKey: 'SK',
            indexes: {
                'user-reference-index': { partitionKey: 'userId' },
            },
        });

        const User = new Entity({
            table,
            name: 'user',
            attributes: {
                PK: { partitionKey: true, default: ({ id }) => `user#${id}` },
                SK: { sortKey: true, default: () => 'METADATA' },

                id: { type: 'string', required: true },
                email: { type: 'string', required: true },
                firstName: { type: 'string', required: true },
                secondName: { type: 'string', required: true },
            },
        });

        const Post = new Entity({
            table,
            name: 'post',
            attributes: {
                PK: { partitionKey: true, default: ({ userId }) => `user#${userId}` },
                SK: { sortKey: true, default: ({ id }) => `post#${id}` },

                id: { type: 'string', required: true },
                userId: { type: 'string', required: true },
                content: { type: 'string', required: true },
            },
        });

        const Comment = new Entity({
            table,
            name: 'comment',
            attributes: {
                PK: {
                    partitionKey: true,
                    default: ({ postId }) => `post#${postId}`,
                },
                SK: { sortKey: true, default: ({ id }) => `comment#${id}` },

                id: { type: 'string', required: true },
                text: { type: 'string', required: true },
                postId: { type: 'string', required: true },
                userId: { type: 'string', required: true },
                user: { type: 'map', required: true },
            },
        });

        return { table, User, Post, Comment };
    }
}

module.exports = Repository;

function batch(n, arr) {
    const numOfBatches = Math.ceil(arr.length / n);

    return [...new Array(numOfBatches).keys()].map(batchN =>
        arr.slice(batchN * n, (batchN + 1) * n),
    );
}
