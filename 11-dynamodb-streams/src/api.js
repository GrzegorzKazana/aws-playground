const createApi = require('lambda-api');
const { DocumentClient } = require('aws-sdk/clients/dynamodb');

const Repository = require('./repo');

/** @type {import('lambda-api').API} */
const api = createApi({ logger: true });
const client = new DocumentClient({
    region: process.env.AWS_REGION,
    endpoint: process.env.DYNAMODB_ENDPOINT || undefined,
});
const repo = new Repository(client);

api.get('/ping', () => ({ pong: new Date().toISOString() }));

api.get('/user/:userId', async (req, _res) => {
    const { userId } = req.params;

    return repo.getUserInfo(userId);
});

api.post('/user', (req, _res) => {
    const { firstName, secondName, email } = req.body || {};

    return repo.createUser(firstName, secondName, email);
});

api.patch('/user/:userId', (req, _res) => {
    const { userId } = req.params;
    const { email } = req.body || {};

    return repo.updateUserEmail(userId, email);
});

api.get('/user/:userId/post', (req, _res) => {
    const { userId } = req.params;

    return repo.getUserPosts(userId);
});

api.post('/post', (req, _res) => {
    const { userId, content } = req.body || {};

    return repo.createPost(userId, content);
});

api.patch('/post/:postId', (req, _res) => {
    const { postId } = req.params;
    const { userId, content } = req.body || {};

    return repo.updatePost(userId, postId, content);
});

api.get('/post/:postId/comment', (req, _res) => {
    const { postId } = req.params;

    return repo.getPostComments(postId);
});

api.post('/post/:postId/comment', (req, _res) => {
    const { postId } = req.params;
    const { user, text } = req.body || {};

    return repo.createComment(postId, user, text);
});

api.get('/_debug/user', (_req, _res) => {
    return repo.listUsers();
});

api.get('/_debug/user/:userId/items', (req, _res) => {
    const { userId } = req.params;

    return repo.getItemsReferencingUser(userId);
});
api.post('/_debug/user/:userId/items/sync', (req, _res) => {
    const { userId } = req.params;

    return repo.updateItemsReferencingUser(userId);
});

exports.handler = api.run.bind(api);
