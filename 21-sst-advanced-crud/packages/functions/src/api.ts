import { ApiHandler } from 'sst/node/api';
import { Config } from 'sst/node/config';
import createApp, { API, RegisterOptions } from 'lambda-api';
import DynamoDB from 'aws-sdk/clients/dynamodb';
import RDS from 'aws-sdk/clients/rds';
import { Bucket } from 'sst/node/bucket';
import { Table } from 'sst/node/table';
import { TaskRepository } from '@21-sst-recipes/core/task-repository';
import { DynamoTaskRepository } from '@21-sst-recipes/core/task-repository-dynamo';
import { RdsTaskRepository } from '@21-sst-recipes/core/task-repository-rds';
import { z } from 'zod';
import { Pool } from 'pg';
import { validatedRoute, orNotFound } from '@21-sst-recipes/core/utils';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const { AWS_REGION } = process.env;

const client = new DynamoDB.DocumentClient();

const signer = new RDS.Signer({
    hostname: Config.PGHOST,
    username: Config.APP_USERNAME,
    port: 5432,
    region: AWS_REGION,
});
const token = signer.getAuthToken({ username: Config.APP_USERNAME });
const pool = new Pool({
    database: Config.APP_DB_NAME,
    user: Config.APP_USERNAME,
    password: token,
    host: Config.PGHOST,
    ssl: {
        ca: readFileSync(resolve(__dirname, './rds/cert/eu-central-1-bundle.pem')).toString(),
    },
});

const repos = {
    RDS: new RdsTaskRepository(pool),
    DYNAMO: new DynamoTaskRepository(client, Table['task-table'].tableName),
};

const app = createApp({});

export const handler = ApiHandler((event, context) => app.run(event, context));

app.register(createApplyRoutes(repos.DYNAMO), { prefix: '' });
app.register(createApplyRoutes(repos.DYNAMO), { prefix: '/dynamo' });
app.register(createApplyRoutes(repos.RDS), { prefix: '/rds' });

function createApplyRoutes(repo: TaskRepository) {
    return (app: API, _opts?: RegisterOptions) => {
        app.get(
            '/project',
            validatedRoute(
                {
                    query: z.object({
                        finished: z
                            .string()
                            .transform(str => str !== 'false')
                            .optional(),
                    }),
                },
                (req, res, next) => {
                    return !req.query.finished
                        ? repo.getAllProjects().catch(next)
                        : repo.getFinishedProjects().catch(next);
                },
            ),
        );

        app.post(
            '/project',
            validatedRoute(
                {
                    body: z.object({
                        name: z.string(),
                        createdDate: permissiveDateString(),
                    }),
                },
                (req, res, next) => {
                    return repo
                        .createProject({ name: req.body.name, createdDate: req.body.createdDate })
                        .catch(next);
                },
            ),
        );

        app.get(
            '/project/:projectId',
            validatedRoute({ params: z.object({ projectId: z.string() }) }, (req, res, next) => {
                return repo
                    .getProjectDetails(req.params.projectId)
                    .then(orNotFound(res))
                    .catch(next);
            }),
        );

        app.patch(
            '/project/:projectId',
            validatedRoute(
                {
                    params: z.object({ projectId: z.string() }),
                    body: z.object({ finishedDate: permissiveDateString() }),
                },
                (req, res, next) => {
                    return repo
                        .finishProject(req.params.projectId, req.body.finishedDate)
                        .then(orNotFound(res))
                        .catch(next);
                },
            ),
        );

        app.delete(
            '/project/:projectId',
            validatedRoute(
                {
                    params: z.object({ projectId: z.string() }),
                },
                (req, res, next) => {
                    return repo.deleteProject(req.params.projectId).catch(next);
                },
            ),
        );

        app.get(
            '/project/:projectId/task',
            validatedRoute(
                {
                    params: z.object({ projectId: z.string() }),
                    query: z.object({
                        assignee: z.string().optional(),
                        status: z.enum(['todo', 'in_progress', 'qa', 'done']).optional(),
                    }),
                },
                (req, res, next) => {
                    return repo
                        .getTasks(req.params.projectId, {
                            status: req.query.status,
                            assignee: req.query.assignee,
                        })
                        .catch(next);
                },
            ),
        );

        app.post(
            '/project/:projectId/task',
            validatedRoute(
                {
                    params: z.object({ projectId: z.string() }),
                    body: z.object({
                        title: z.string(),
                        description: z.string(),
                        status: z.enum(['todo', 'in_progress', 'qa', 'done']).optional(),
                    }),
                },
                (req, res, next) => {
                    return repo
                        .createTask({
                            project: req.params.projectId,
                            title: req.body.title,
                            description: req.body.description,
                            status: req.body.status || 'todo',
                        })
                        .catch(next);
                },
            ),
        );

        app.get(
            '/project/:projectId/task/:taskId',
            validatedRoute(
                {
                    params: z.object({ projectId: z.string(), taskId: z.string() }),
                },
                (req, res, next) => {
                    return repo
                        .getTaskDetails(req.params.projectId, req.params.taskId)
                        .then(orNotFound(res))
                        .catch(next);
                },
            ),
        );

        app.patch(
            '/project/:projectId/task/:taskId',
            validatedRoute(
                {
                    params: z.object({ projectId: z.string(), taskId: z.string() }),
                    body: z.object({ status: z.enum(['todo', 'in_progress', 'qa', 'done']) }),
                },
                (req, res, next) => {
                    return repo
                        .changeTaskStatus(req.params.projectId, req.params.taskId, req.body.status)
                        .then(orNotFound(res))
                        .catch(next);
                },
            ),
        );

        app.post(
            '/project/:projectId/task/:taskId/employee',
            validatedRoute(
                {
                    params: z.object({ projectId: z.string(), taskId: z.string() }),
                    body: z.object({ assignee: z.string() }),
                },
                (req, res, next) => {
                    return repo
                        .assignTaskToEmployee(
                            req.params.projectId,
                            req.params.taskId,
                            req.body.assignee,
                        )
                        .then(orNotFound(res))
                        .catch(next);
                },
            ),
        );

        app.get(
            '/project/:projectId/employee',
            validatedRoute(
                {
                    params: z.object({ projectId: z.string() }),
                    query: z.object({
                        role: z.enum(['developer', 'tester', 'manager']).optional(),
                    }),
                },
                (req, res, next) => {
                    return repo
                        .getEmployees({ project: req.params.projectId, role: req.query.role })
                        .catch(next);
                },
            ),
        );

        app.post(
            '/project/:projectId/employee',
            validatedRoute(
                {
                    params: z.object({ projectId: z.string() }),
                    body: z.object({
                        role: z.enum(['developer', 'tester', 'manager']),
                        employee: z.string(),
                    }),
                },
                (req, res, next) => {
                    return repo
                        .assignEmployeeToProject({
                            project: req.params.projectId,
                            role: req.body.role,
                            employee: req.body.employee,
                        })
                        .catch(next);
                },
            ),
        );

        app.delete(
            '/project/:projectId/employee/:employeeId',
            validatedRoute(
                {
                    params: z.object({ projectId: z.string(), employeeId: z.string() }),
                },
                (req, res, next) => {
                    return repo
                        .unassignEmployeeFromProject({
                            project: req.params.projectId,
                            employee: req.body.employee,
                        })
                        .catch(next);
                },
            ),
        );

        app.get(
            '/employee',
            validatedRoute({}, (req, res, next) => {
                return repo.getAllEmployees().catch(next);
            }),
        );

        app.post(
            '/employee',
            validatedRoute(
                { body: z.object({ firstName: z.string(), lastName: z.string() }) },
                (req, res, next) => {
                    return repo
                        .createEmployee({
                            firstName: req.body.firstName,
                            lastName: req.body.lastName,
                        })
                        .catch(next);
                },
            ),
        );

        app.get(
            '/employee/:employeeId',
            validatedRoute({ params: z.object({ employeeId: z.string() }) }, (req, res, next) => {
                return repo
                    .getEmployeeDetails(req.params.employeeId)
                    .then(orNotFound(res))
                    .catch(next);
            }),
        );

        app.delete(
            '/employee/:employeeId',
            validatedRoute({ params: z.object({ employeeId: z.string() }) }, (req, res, next) => {
                return repo.deleteEmployee(req.params.employeeId).catch(next);
            }),
        );

        app.get(
            '/employee/:employeeId/project',
            validatedRoute({ params: z.object({ employeeId: z.string() }) }, (req, res, next) => {
                return repo.getProjectsByEmployee(req.params.employeeId).catch(next);
            }),
        );

        app.get(
            '/archive/project/:projectId',
            validatedRoute({ params: z.object({ projectId: z.string() }) }, (req, res, next) => {
                const path = `projects/${req.params.projectId}.json`;
                const identifier = `s3://${Bucket['project-archive'].bucketName}/${path}`;

                return res.redirect(identifier);
            }),
        );

        return app;
    };
}

function permissiveDateString() {
    return z
        .string()
        .datetime()
        .or(
            z
                .string()
                .regex(/\d{4}-\d{2}-\d{2}/)
                .refine(dateStr => !Number.isNaN(new Date(dateStr).getTime())),
        );
}
