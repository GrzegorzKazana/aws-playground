import { ApiHandler } from 'sst/node/api';
import createApp from 'lambda-api';
import DynamoDB from 'aws-sdk/clients/dynamodb';
import { Bucket } from 'sst/node/bucket';
import { Table } from 'sst/node/table';
import { TaskRepository } from '@21-sst-recipes/core/task-repository';
import { z } from 'zod';
import { validatedRoute, orNotFound } from '@21-sst-recipes/core/utils';

const repo = new TaskRepository(new DynamoDB.DocumentClient(), Table['task-table'].tableName);

const app = createApp({});
const permissiveDateString = () =>
    z
        .string()
        .datetime()
        .or(
            z
                .string()
                .regex(/\d{4}-\d{2}-\d{2}/)
                .refine(dateStr => !Number.isNaN(new Date(dateStr).getTime())),
        );

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
        return repo.getProjectDetails(req.params.projectId).then(orNotFound(res)).catch(next);
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
            body: z.object({ title: z.string(), description: z.string() }),
        },
        (req, res, next) => {
            return repo
                .createTask({
                    project: req.params.projectId,
                    title: req.body.title,
                    description: req.body.description,
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
                .assignTaskToEmployee(req.params.projectId, req.params.taskId, req.body.assignee)
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
                .createEmployee({ firstName: req.body.firstName, lastName: req.body.lastName })
                .catch(next);
        },
    ),
);

app.get(
    '/employee/:employeeId',
    validatedRoute({ params: z.object({ employeeId: z.string() }) }, (req, res, next) => {
        return repo.getEmployeeDetails(req.params.employeeId).then(orNotFound(res)).catch(next);
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

export const handler = ApiHandler((event, context) => app.run(event, context));
