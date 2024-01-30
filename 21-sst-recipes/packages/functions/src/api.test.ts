import { describe, it, expect } from 'vitest';
import { Api } from 'sst/node/api';
import { Config } from 'sst/node/config';
import request from 'supertest';
import { EmployeeId, ProjectId, TaskId } from '@21-sst-recipes/core/task-repository';
import assert from 'assert';

assert(Config.STAGE.startsWith('dev'), 'Cannot run tests on non-dev stages!');

describe(
    'api',
    () => {
        const resources = {
            project: '' as ProjectId,
            employees: {} as Record<string, EmployeeId>,
            tasks: {} as Record<string, TaskId>,
        };

        it('should allow for creating project', async () => {
            resources.project = await request(Api.api.url)
                .post('/project')
                .set('Accept', 'application/json')
                .send({ name: 'Foo bar test project', createdDate: '2011-10-10' })
                .expect(200)
                .then(response => response.body.id);
        });

        it('should allow for getting the project', async () => {
            return request(Api.api.url)
                .get(`/project/${resources.project}`)
                .expect(200)
                .then(response => {
                    expect(response.body).toMatchObject({
                        id: resources.project,
                        name: 'Foo bar test project',
                        createdDate: '2011-10-10',
                    });
                });
        });

        it('should return 400 on invalid input', async () => {
            return request(Api.api.url)
                .post('/project')
                .set('Accept', 'application/json')
                .send({ createdDate: 'foobar' })
                .expect(400);
        });

        it('should create employees', async () => {
            resources.employees.John = await request(Api.api.url)
                .post('/employee')
                .set('Accept', 'application/json')
                .send({ firstName: 'John', lastName: 'Kowalski' })
                .expect(200)
                .then(({ body }) => body.id);

            resources.employees.Laura = await request(Api.api.url)
                .post('/employee')
                .set('Accept', 'application/json')
                .send({ firstName: 'Laura', lastName: 'Smith' })
                .expect(200)
                .then(({ body }) => body.id);
        });

        it('should assign employees to project', async () => {
            await request(Api.api.url)
                .post(`/project/${resources.project}/employee`)
                .set('Accept', 'application/json')
                .send({ role: 'manager', employee: resources.employees.John })
                .expect(200);

            await request(Api.api.url)
                .post(`/project/${resources.project}/employee`)
                .set('Accept', 'application/json')
                .send({ role: 'developer', employee: resources.employees.Laura })
                .expect(200);
        });

        it('should list project employees', async () => {
            await request(Api.api.url)
                .get(`/project/${resources.project}/employee`)
                .expect(200)
                .then(({ body }) => {
                    expect(sortById(body)).toMatchObject(
                        sortById([
                            { id: resources.employees.John },
                            { id: resources.employees.Laura },
                        ]),
                    );
                });
        });

        it('should create tasks', async () => {
            resources.tasks.task1 = await request(Api.api.url)
                .post(`/project/${resources.project}/task`)
                .set('Accept', 'application/json')
                .send({ title: 'Task 1', description: 'do that' })
                .expect(200)
                .then(({ body }) => body.id);

            resources.tasks.task2 = await request(Api.api.url)
                .post(`/project/${resources.project}/task`)
                .set('Accept', 'application/json')
                .send({ title: 'Task 2', description: 'and this' })
                .expect(200)
                .then(({ body }) => body.id);

            resources.tasks.task3 = await request(Api.api.url)
                .post(`/project/${resources.project}/task`)
                .set('Accept', 'application/json')
                .send({ title: 'Task 3', description: 'and that as well' })
                .expect(200)
                .then(({ body }) => body.id);
        });

        it('should assign tasks to users', async () => {
            await request(Api.api.url)
                .post(`/project/${resources.project}/task/${resources.tasks.task1}/employee`)
                .set('Accept', 'application/json')
                .send({ assignee: resources.employees.John })
                .expect(200);

            await request(Api.api.url)
                .post(`/project/${resources.project}/task/${resources.tasks.task2}/employee`)
                .set('Accept', 'application/json')
                .send({ assignee: resources.employees.John })
                .expect(200);

            await request(Api.api.url)
                .post(`/project/${resources.project}/task/${resources.tasks.task3}/employee`)
                .set('Accept', 'application/json')
                .send({ assignee: resources.employees.Laura })
                .expect(200);
        });

        it('should change tasks status', async () => {
            await request(Api.api.url)
                .patch(`/project/${resources.project}/task/${resources.tasks.task1}`)
                .set('Accept', 'application/json')
                .send({ status: 'in_progress' })
                .expect(200);

            await request(Api.api.url)
                .patch(`/project/${resources.project}/task/${resources.tasks.task1}`)
                .set('Accept', 'application/json')
                .send({ status: 'qa' })
                .expect(200);

            await request(Api.api.url)
                .patch(`/project/${resources.project}/task/${resources.tasks.task2}`)
                .set('Accept', 'application/json')
                .send({ status: 'in_progress' })
                .expect(200);

            await request(Api.api.url)
                .patch(`/project/${resources.project}/task/${resources.tasks.task3}`)
                .set('Accept', 'application/json')
                .send({ status: 'in_progress' })
                .expect(200);
        });

        it('should query tasks', async () => {
            await request(Api.api.url)
                .get(`/project/${resources.project}/task`)
                .expect(200)
                .then(({ body }) => {
                    expect(sortById(body)).toMatchObject(
                        sortById([
                            { id: resources.tasks.task1, assignee: resources.employees.John },
                            { id: resources.tasks.task2, assignee: resources.employees.John },
                            { id: resources.tasks.task3, assignee: resources.employees.Laura },
                        ]),
                    );
                });
        });

        it('should query tasks by assignee', async () => {
            await request(Api.api.url)
                .get(`/project/${resources.project}/task?assignee=${resources.employees.John}`)
                .expect(200)
                .then(({ body }) => {
                    expect(sortById(body)).toMatchObject(
                        sortById([
                            { id: resources.tasks.task1, assignee: resources.employees.John },
                            { id: resources.tasks.task2, assignee: resources.employees.John },
                        ]),
                    );
                });

            await request(Api.api.url)
                .get(`/project/${resources.project}/task?assignee=${resources.employees.Laura}`)
                .expect(200)
                .then(({ body }) => {
                    expect(sortById(body)).toMatchObject(
                        sortById([
                            { id: resources.tasks.task3, assignee: resources.employees.Laura },
                        ]),
                    );
                });
        });

        it('should query tasks by status', async () => {
            await request(Api.api.url)
                .get(`/project/${resources.project}/task?status=todo`)
                .expect(200)
                .then(({ body }) => {
                    expect(sortById(body)).toMatchObject(sortById([]));
                });

            await request(Api.api.url)
                .get(`/project/${resources.project}/task?status=in_progress`)
                .expect(200)
                .then(({ body }) => {
                    expect(sortById(body)).toMatchObject(
                        sortById([{ id: resources.tasks.task2 }, { id: resources.tasks.task3 }]),
                    );
                });

            await request(Api.api.url)
                .get(`/project/${resources.project}/task?status=qa`)
                .expect(200)
                .then(({ body }) => {
                    expect(sortById(body)).toMatchObject(sortById([{ id: resources.tasks.task1 }]));
                });
        });

        it('should allow to finish project', async () => {
            await request(Api.api.url)
                .patch(`/project/${resources.project}`)
                .set('Accept', 'application/json')
                .send({ finishedDate: '2030-02-19' })
                .expect(200);
        });

        it(
            'should create finished project archive',
            async () => {
                await request(Api.api.url)
                    .get(`/archive/project/${resources.project}`)
                    .redirects(5)
                    .then(({ body, statusCode }) => {
                        if (statusCode === 404)
                            return wait(5000).then(() =>
                                Promise.reject(new Error('Archive not found')),
                            );

                        const jsonBody = JSON.parse(body.toString());

                        expect(jsonBody.id).toEqual(resources.project);
                        expect(sortById(jsonBody.employees)).toMatchObject(
                            sortById([
                                { id: resources.employees.John },
                                { id: resources.employees.Laura },
                            ]),
                        );
                        expect(sortById(jsonBody.tasks)).toMatchObject(
                            sortById([
                                { id: resources.tasks.task1 },
                                { id: resources.tasks.task2 },
                                { id: resources.tasks.task3 },
                            ]),
                        );
                    });
                // the archive is created asynchronously, so we might have to wait for it
            },
            { retry: 3, timeout: 30_000 },
        );

        it(
            'should clean up resources',
            async () => {
                await request(Api.api.url).delete(`/project/${resources.project}`).expect(200);
                await request(Api.api.url)
                    .delete(`/employee/${resources.employees.John}`)
                    .expect(200);
                await request(Api.api.url)
                    .delete(`/employee/${resources.employees.Laura}`)
                    .expect(200);
            },
            { timeout: 30_000 },
        );
    },
    { timeout: 15000 },
);

function sortById<T extends { id: string }>(items: T[]): T[] {
    return [...items].sort((a, b) => (a.id === b.id ? 0 : a.id > b.id ? 1 : -1));
}

function wait(n: number) {
    return new Promise(res => setTimeout(res, n));
}
