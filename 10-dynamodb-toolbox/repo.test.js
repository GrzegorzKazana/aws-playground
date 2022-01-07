/// <reference types="@types/jest" />
const { DocumentClient } = require('aws-sdk/clients/dynamodb');

const Repository = require('./repo');

describe('Repository', () => {
    const client = new DocumentClient({
        region: 'eu-central-1',
        // to run the table locally:
        // docker run --rm -p '8000:8000' amazon/dynamodb-local -jar DynamoDBLocal.jar -sharedDb -dbPath .
        // aws dynamodb create-table --cli-input-json file://table.json --endpoint-url http://localhost:8000
        endpoint: 'http://localhost:8000',
    });
    const repo = new Repository(client);

    async function insertOrganizations() {
        const {
            params: { id: org1 },
        } = await repo.createOrganization('Org 1.');
        const {
            params: { id: org2 },
        } = await repo.createOrganization('Org 2.');

        return { org1, org2 };
    }

    async function insertUsers({ org1, org2 }) {
        const {
            params: { id: user1 },
        } = await repo.createUser(org1, 'tomas.collado');
        const {
            params: { id: user2 },
        } = await repo.createUser(org1, 'alfredo.pedraza');
        const {
            params: { id: user3 },
        } = await repo.createUser(org2, 'mariano.burgos');
        const {
            params: { id: user4 },
        } = await repo.createUser(org2, 'vicente.montalvo');

        return { user1, user2, user3, user4 };
    }

    async function insertProjects({ org1, org2, user1, user2, user3, user4 }) {
        const {
            params: {
                project: { id: project1 },
            },
        } = await repo.createProject(org1, 'Project A1', user1);
        const {
            params: {
                project: { id: project2 },
            },
        } = await repo.createProject(org1, 'Project A2', user1);
        const {
            params: {
                project: { id: project3 },
            },
        } = await repo.createProject(org2, 'Project B1', user3);
        const {
            params: {
                project: { id: project4 },
            },
        } = await repo.createProject(org2, 'Project B2', user4);

        return { project1, project2, project3, project4 };
    }

    async function assignUsersToProjects(ctx) {
        await repo.assignUserToProject(ctx.org1, ctx.project1, ctx.user2, 'DEV');
        await repo.assignUserToProject(ctx.org1, ctx.project2, ctx.user2, 'DEV');
        await repo.assignUserToProject(ctx.org2, ctx.project3, ctx.user4, 'DEV');
        await repo.assignUserToProject(ctx.org2, ctx.project4, ctx.user3, 'DEV');
    }

    async function insertTasks(ctx) {
        const {
            params: { id: task1 },
        } = await repo.createTask(ctx.org1, ctx.project1, 'Task A1-1', ctx.user2);
        const {
            params: { id: task2 },
        } = await repo.createTask(ctx.org1, ctx.project1, 'Task A1-2', ctx.user2);
        const {
            params: { id: task3 },
        } = await repo.createTask(ctx.org2, ctx.project3, 'Task B1-1', ctx.user4);
        const {
            params: { id: task4 },
        } = await repo.createTask(ctx.org2, ctx.project3, 'Task B1-2', ctx.user4);

        return { task1, task2, task3, task4 };
    }

    async function insertComments(ctx) {
        await repo.createComment(ctx.org1, ctx.project1, ctx.task1, ctx.user1, 'ok');
        await repo.createComment(ctx.org1, ctx.project1, ctx.task1, ctx.user2, 'fine');
    }

    async function transitionTasks(ctx) {
        await repo.transitionTaskToStatus(ctx.org1, ctx.project1, ctx.task1, 'IN_PROGRESS');
        await repo.transitionTaskToStatus(ctx.org1, ctx.project1, ctx.task2, 'IN_PROGRESS');
        await repo.transitionTaskToStatus(ctx.org1, ctx.project1, ctx.task2, 'DONE');
    }

    async function cleanUp() {
        const { Items: items } = await repo.table.scan({});
        // BatchWrite supports up to 25 items
        const batches = batch(25, items);

        const requests = batches
            .map(items => ({
                RequestItems: {
                    [repo.table.name]: items.map(({ PK, SK }) => ({
                        DeleteRequest: { Key: { PK, SK } },
                    })),
                },
            }))
            .map(params => client.batchWrite(params).promise());

        await Promise.all(requests);
    }

    afterEach(cleanUp);

    it('should allow for inserting and getting organizations', async () => {
        const orgs = await insertOrganizations();

        const org1 = await repo.getOrganizationDetail(orgs.org1);
        const org2 = await repo.getOrganizationDetail(orgs.org2);

        expect(org1.Item).toEqual(
            expect.objectContaining({
                id: orgs.org1,
                name: 'Org 1.',
            }),
        );
        expect(org2.Item).toEqual(
            expect.objectContaining({
                id: orgs.org2,
                name: 'Org 2.',
            }),
        );
    });

    it('should allow for inserting and querying organizations users', async () => {
        const orgs = await insertOrganizations();
        const users = await insertUsers(orgs);

        const org1 = await repo.listUsersInOrganization(orgs.org1);
        const org2 = await repo.listUsersInOrganization(orgs.org2);

        expect(org1.Items).toHaveLength(2);
        expect(org2.Items).toHaveLength(2);
        expect(org1.Items).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ id: users.user1, org: orgs.org1, name: 'tomas.collado' }),
                expect.objectContaining({
                    id: users.user2,
                    org: orgs.org1,
                    name: 'alfredo.pedraza',
                }),
            ]),
        );
        expect(org2.Items).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    id: users.user3,
                    org: orgs.org2,
                    name: 'mariano.burgos',
                }),
                expect.objectContaining({
                    id: users.user4,
                    org: orgs.org2,
                    name: 'vicente.montalvo',
                }),
            ]),
        );
    });

    it('should insert and list projects in organization', async () => {
        const orgs = await insertOrganizations();
        const users = await insertUsers(orgs);
        const projects = await insertProjects({ ...orgs, ...users });

        const projects1 = await repo.listProjectsInOrganization(orgs.org1);
        const projects2 = await repo.listProjectsInOrganization(orgs.org2);

        expect(projects1.Items).toHaveLength(2);
        expect(projects2.Items).toHaveLength(2);
        expect(projects1.Items).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    id: projects.project1,
                    org: orgs.org1,
                    name: 'Project A1',
                }),
                expect.objectContaining({
                    id: projects.project2,
                    org: orgs.org1,
                    name: 'Project A2',
                }),
            ]),
        );
        expect(projects2.Items).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    id: projects.project3,
                    org: orgs.org2,
                    name: 'Project B1',
                }),
                expect.objectContaining({
                    id: projects.project4,
                    org: orgs.org2,
                    name: 'Project B2',
                }),
            ]),
        );
    });

    it('should get user role in specific project', async () => {
        const orgs = await insertOrganizations();
        const users = await insertUsers(orgs);
        const projects = await insertProjects({ ...orgs, ...users });
        const _ = await assignUsersToProjects({ ...orgs, ...users, ...projects });

        const role1 = await repo.getUserRoleInProject(orgs.org1, projects.project1, users.user1);
        const role2 = await repo.getUserRoleInProject(orgs.org1, projects.project1, users.user2);
        const role3 = await repo.getUserRoleInProject(orgs.org1, projects.project2, users.user1);
        const role4 = await repo.getUserRoleInProject(orgs.org1, projects.project2, users.user2);

        const role5 = await repo.getUserRoleInProject(orgs.org2, projects.project3, users.user3);
        const role6 = await repo.getUserRoleInProject(orgs.org2, projects.project3, users.user4);
        const role7 = await repo.getUserRoleInProject(orgs.org2, projects.project4, users.user3);
        const role8 = await repo.getUserRoleInProject(orgs.org2, projects.project4, users.user4);

        expect(role1.Item.role).toBe('ADMIN');
        expect(role2.Item.role).toBe('DEV');
        expect(role3.Item.role).toBe('ADMIN');
        expect(role4.Item.role).toBe('DEV');
        expect(role5.Item.role).toBe('ADMIN');
        expect(role6.Item.role).toBe('DEV');
        expect(role7.Item.role).toBe('DEV');
        expect(role8.Item.role).toBe('ADMIN');
    });

    it('should list users and their role in projects', async () => {
        const orgs = await insertOrganizations();
        const users = await insertUsers(orgs);
        const projects = await insertProjects({ ...orgs, ...users });
        const _ = await assignUsersToProjects({ ...orgs, ...users, ...projects });

        const users1 = await repo.listUsersInProject(orgs.org1, projects.project1);
        const users2 = await repo.listUsersInProject(orgs.org1, projects.project2);
        const users3 = await repo.listUsersInProject(orgs.org2, projects.project3);
        const users4 = await repo.listUsersInProject(orgs.org2, projects.project4);

        expect(users1.Items).toHaveLength(2);
        expect(users2.Items).toHaveLength(2);
        expect(users3.Items).toHaveLength(2);
        expect(users4.Items).toHaveLength(2);

        expect(users1.Items).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ id: users.user1, role: 'ADMIN' }),
                expect.objectContaining({ id: users.user2, role: 'DEV' }),
            ]),
        );
        expect(users2.Items).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ id: users.user1, role: 'ADMIN' }),
                expect.objectContaining({ id: users.user2, role: 'DEV' }),
            ]),
        );
        expect(users3.Items).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ id: users.user3, role: 'ADMIN' }),
                expect.objectContaining({ id: users.user4, role: 'DEV' }),
            ]),
        );
        expect(users4.Items).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ id: users.user3, role: 'DEV' }),
                expect.objectContaining({ id: users.user4, role: 'ADMIN' }),
            ]),
        );
    });

    it('should list tasks projects', async () => {
        const orgs = await insertOrganizations();
        const users = await insertUsers(orgs);
        const projects = await insertProjects({ ...orgs, ...users });
        const _ = await assignUsersToProjects({ ...orgs, ...users, ...projects });
        const tasks = await insertTasks({ ...orgs, ...users, ...projects });

        const tasks1 = await repo.listTasks(orgs.org1, projects.project1);
        const tasks2 = await repo.listTasks(orgs.org1, projects.project2);
        const tasks3 = await repo.listTasks(orgs.org2, projects.project3);
        const tasks4 = await repo.listTasks(orgs.org2, projects.project4);

        expect(tasks1.Items).toHaveLength(2);
        expect(tasks2.Items).toHaveLength(0);
        expect(tasks3.Items).toHaveLength(2);
        expect(tasks4.Items).toHaveLength(0);

        expect(tasks1.Items).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    id: tasks.task1,
                    project: projects.project1,
                    org: orgs.org1,
                    name: 'Task A1-1',
                }),
                expect.objectContaining({
                    id: tasks.task2,
                    project: projects.project1,
                    org: orgs.org1,
                    name: 'Task A1-2',
                }),
            ]),
        );
        expect(tasks3.Items).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    id: tasks.task3,
                    project: projects.project3,
                    org: orgs.org2,
                    name: 'Task B1-1',
                }),
                expect.objectContaining({
                    id: tasks.task4,
                    project: projects.project3,
                    org: orgs.org2,
                    name: 'Task B1-2',
                }),
            ]),
        );
    });

    it('should get task details', async () => {
        const orgs = await insertOrganizations();
        const users = await insertUsers(orgs);
        const projects = await insertProjects({ ...orgs, ...users });
        const _ = await assignUsersToProjects({ ...orgs, ...users, ...projects });
        const tasks = await insertTasks({ ...orgs, ...users, ...projects });
        const __ = await transitionTasks({ ...orgs, ...users, ...projects, ...tasks });

        const task1 = await repo.getTask(orgs.org1, projects.project1, tasks.task1);
        const task2 = await repo.getTask(orgs.org1, projects.project1, tasks.task2);
        const task3 = await repo.getTask(orgs.org2, projects.project3, tasks.task3);
        const task4 = await repo.getTask(orgs.org2, projects.project3, tasks.task4);

        expect(task1.Item).toEqual(
            expect.objectContaining({
                id: tasks.task1,
                project: projects.project1,
                name: 'Task A1-1',
                assignee: users.user2,
                status: 'IN_PROGRESS',
            }),
        );
        expect(task2.Item).toEqual(
            expect.objectContaining({
                id: tasks.task2,
                project: projects.project1,
                name: 'Task A1-2',
                assignee: users.user2,
                status: 'DONE',
            }),
        );
        expect(task3.Item).toEqual(
            expect.objectContaining({
                id: tasks.task3,
                project: projects.project3,
                name: 'Task B1-1',
                assignee: users.user4,
                status: 'TODO',
            }),
        );
        expect(task4.Item).toEqual(
            expect.objectContaining({
                id: tasks.task4,
                project: projects.project3,
                name: 'Task B1-2',
                assignee: users.user4,
                status: 'TODO',
            }),
        );
    });

    it('should list tasks assigned to specific user', async () => {
        const orgs = await insertOrganizations();
        const users = await insertUsers(orgs);
        const projects = await insertProjects({ ...orgs, ...users });
        const _ = await assignUsersToProjects({ ...orgs, ...users, ...projects });
        const tasks = await insertTasks({ ...orgs, ...users, ...projects });
        const __ = await transitionTasks({ ...orgs, ...users, ...projects, ...tasks });

        const tasks1 = await repo.listTasksByUser(orgs.org1, projects.project1, users.user1);
        const tasks2 = await repo.listTasksByUser(orgs.org1, projects.project1, users.user2);
        const tasks3 = await repo.listTasksByUser(orgs.org2, projects.project3, users.user3);
        const tasks4 = await repo.listTasksByUser(orgs.org2, projects.project3, users.user4);

        expect(tasks1.Items).toHaveLength(0);
        expect(tasks2.Items).toHaveLength(2);
        expect(tasks3.Items).toHaveLength(0);
        expect(tasks4.Items).toHaveLength(2);

        expect(tasks2.Items).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ id: tasks.task1 }),
                expect.objectContaining({ id: tasks.task2 }),
            ]),
        );
        expect(tasks4.Items).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ id: tasks.task3 }),
                expect.objectContaining({ id: tasks.task4 }),
            ]),
        );
    });

    it('should list tasks in specific status', async () => {
        const orgs = await insertOrganizations();
        const users = await insertUsers(orgs);
        const projects = await insertProjects({ ...orgs, ...users });
        const _ = await assignUsersToProjects({ ...orgs, ...users, ...projects });
        const tasks = await insertTasks({ ...orgs, ...users, ...projects });
        const __ = await transitionTasks({ ...orgs, ...users, ...projects, ...tasks });

        const tasks1 = await repo.listTasksByStatus(orgs.org1, projects.project1, 'TODO');
        const tasks2 = await repo.listTasksByStatus(orgs.org1, projects.project1, 'IN_PROGRESS');
        const tasks3 = await repo.listTasksByStatus(orgs.org1, projects.project1, 'DONE');
        const tasks4 = await repo.listTasksByStatus(orgs.org2, projects.project3, 'TODO');
        const tasks5 = await repo.listTasksByStatus(orgs.org2, projects.project3, 'IN_PROGRESS');
        const tasks6 = await repo.listTasksByStatus(orgs.org2, projects.project3, 'DONE');

        expect(tasks1.Items).toHaveLength(0);
        expect(tasks2.Items).toHaveLength(1);
        expect(tasks3.Items).toHaveLength(1);
        expect(tasks4.Items).toHaveLength(2);
        expect(tasks5.Items).toHaveLength(0);
        expect(tasks6.Items).toHaveLength(0);

        expect(tasks2.Items).toEqual(
            expect.arrayContaining([expect.objectContaining({ id: tasks.task1 })]),
        );
        expect(tasks3.Items).toEqual(
            expect.arrayContaining([expect.objectContaining({ id: tasks.task2 })]),
        );
        expect(tasks4.Items).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ id: tasks.task3 }),
                expect.objectContaining({ id: tasks.task4 }),
            ]),
        );
    });

    it('should list comments of specific task', async () => {
        const orgs = await insertOrganizations();
        const users = await insertUsers(orgs);
        const projects = await insertProjects({ ...orgs, ...users });
        const _ = await assignUsersToProjects({ ...orgs, ...users, ...projects });
        const tasks = await insertTasks({ ...orgs, ...users, ...projects });
        const __ = await transitionTasks({ ...orgs, ...users, ...projects, ...tasks });
        const ___ = await insertComments({ ...orgs, ...users, ...projects, ...tasks });

        const comments1 = await repo.getTaskComments(orgs.org1, projects.project1, tasks.task1);
        const comments2 = await repo.getTaskComments(orgs.org1, projects.project1, tasks.task2);

        expect(comments1.Items).toHaveLength(2);
        expect(comments2.Items).toHaveLength(0);

        expect(comments1.Items).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ text: 'ok' }),
                expect.objectContaining({ text: 'fine' }),
            ]),
        );
    });
});

function batch(n, arr) {
    const numOfBatches = Math.ceil(arr.length / n);

    return [...new Array(numOfBatches).keys()].map(batchN =>
        arr.slice(batchN * n, (batchN + 1) * n),
    );
}
