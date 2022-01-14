const { DocumentClient } = require('aws-sdk/clients/dynamodb');

const Repository = require('./repo');

const client = new DocumentClient({
    region: process.env.AWS_REGION,
    endpoint: process.env.DYNAMODB_ENDPOINT || undefined,
});
const repo = new Repository(client);

exports.handler = (event, context) => {
    console.log('invoking seeding function', event, context);
    console.log(event);
    console.log(context);

    return seed(repo);
};

exports.purge = (event, context) => {
    console.log('invoking purge function', event, context);

    return purge(repo);
};

/**
 * @param {import('./repo.js')} repo
 */
async function seed(repo) {
    const { params: user1 } = await repo.createUser('Curt', 'Payton', 'curt@gmail.com');
    const { params: user2 } = await repo.createUser(
        'Jessica',
        'Farley',
        'jessica.farley@gmail.com',
    );

    const { id: post1 } = await repo.createPost(user1.id, 'Turnips are wild');

    const { id: comment1 } = await repo.createComment(post1, user2, 'totally');
    const { id: comment2 } = await repo.createComment(post1, user1, 'bruh');

    return { user1, user2, post1, comment1, comment2 };
}

/**
 * @param {import('./repo.js')} repo
 */
async function purge(repo) {
    const { Items: items } = await repo.table.scan({});
    // BatchWrite supports up to 25 items
    const batches = Repository.batch(25, items);

    const requests = batches
        .map(items => ({
            RequestItems: {
                [repo.table.name]: items.map(({ PK, SK }) => ({
                    DeleteRequest: { Key: { PK, SK } },
                })),
            },
        }))
        .map(params => client.batchWrite(params).promise());

    return Promise.all(requests);
}
