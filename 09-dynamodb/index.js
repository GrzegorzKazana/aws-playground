const dynamo = require('aws-sdk/clients/dynamodb');

const KanbanRepository = require('./repo');

const client = new dynamo.DocumentClient({ region: 'eu-central-1' });
const repo = new KanbanRepository(client);

const data = repo.createTask('and do not forget to');
// const data = client.scan({ TableName: 'task09-kanban', IndexName: 'GSI1' }).promise();
// const data = repo.changeTaskStatus('fa176847-8dd7-4c7c-ad21-f8347b2dcea5', 'DONE');
// const data = repo.getTasksInStatus('IN_PROGRESS');
// const data = repo.getTasks();
// const data = repo.getTaskEvents('fa176847-8dd7-4c7c-ad21-f8347b2dcea5');
// const data = repo.getTaskDetails('0b80995a-3adb-44e2-99c1-7683853a91b1');
// const data = repo.deleteTask('0b80995a-3adb-44e2-99c1-7683853a91b1');

data.then(console.log).catch(console.error);
