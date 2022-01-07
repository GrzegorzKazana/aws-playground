const { DocumentClient } = require('aws-sdk/clients/dynamodb');

const Repository = require('./repo');

const client = new DocumentClient({ region: 'eu-central-1', endpoint: 'http://localhost:8000' });
const repo = new Repository(client);

const data = repo.createOrganization('Org 1.');

data.then(console.log).catch(console.error);
