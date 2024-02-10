import { describe, it, expect, afterAll } from 'vitest';
import DynamoDB from 'aws-sdk/clients/dynamodb';
import RDS from 'aws-sdk/clients/rds';
import { Pool } from 'pg';
import { Table } from 'sst/node/table';
import { Config } from 'sst/node/config';
import assert from 'assert';
import { readFileSync } from 'fs';
import { resolve } from 'path';

import { Project, Employee, Task } from './task-repository';
import { DynamoTaskRepository } from './task-repository-dynamo';
import { RdsTaskRepository } from './task-repository-rds';

assert(Config.STAGE.startsWith('dev'), 'Cannot run tests on non-dev stages!');

describe('task-repository', () => {
    const client = new DynamoDB.DocumentClient();
    const dynamoRepo = new DynamoTaskRepository(client, Table['test-todo-table'].tableName);

    const signer = new RDS.Signer({
        hostname: Config.PGHOST,
        username: Config.APP_USERNAME,
        port: 5432,
        region: Config.AWS_REGION,
    });
    const token = signer.getAuthToken({ username: Config.APP_USERNAME });
    const pool = new Pool({
        database: Config.APP_TEST_DB_NAME,
        user: Config.APP_USERNAME,
        password: token,
        host: Config.PGHOST,
        ssl: {
            ca: readFileSync(resolve(__dirname, './cert/eu-central-1-bundle.pem')).toString(),
        },
    });
    const rdsRepo = new RdsTaskRepository(pool);

    const repos = {
        RDS: rdsRepo,
        DYNAMO: dynamoRepo,
    };

    Object.entries(repos).forEach(([repoName, repo]) => {
        describe(repoName, () => {
            const m = mocks();

            afterAll(() => repo._purge());

            it('should insert projects', async () => {
                const { id: idA } = await repo.createProject(m.projects.PA);
                const { id: idB } = await repo.createProject(m.projects.PB);
                const { id: idC } = await repo.createProject(m.projects.PC);

                const projects = await repo.getAllProjects();
                const projectIds = projects.map(({ id }) => id);

                expect(projects).toHaveLength(3);
                expect(projectIds).toContain(idA);
                expect(projectIds).toContain(idB);
                expect(projectIds).toContain(idC);
            });

            it('should insert employees', async () => {
                await repo.createEmployee(m.employees.Marcelino);
                await repo.createEmployee(m.employees.Orpha);
                await repo.createEmployee(m.employees.Abigale);
                await repo.createEmployee(m.employees.Domenic);
                await repo.createEmployee(m.employees.Arlo);
                await repo.createEmployee(m.employees.Sylvester);
                await repo.createEmployee(m.employees.Carlo);

                const employees = await repo.getAllEmployees();

                expect(employees).toHaveLength(7);
            });

            it('should insert tasks', async () => {
                await Promise.all(Object.values(m.tasks).map(t => repo.createTask(t)));

                const tasksPA = await repo.getAllTasks(m.projects.PA.id);
                const tasksPB = await repo.getAllTasks(m.projects.PB.id);
                const tasksPC = await repo.getAllTasks(m.projects.PC.id);

                expect(tasksPA).toHaveLength(5);
                expect(tasksPB).toHaveLength(4);
                expect(tasksPC).toHaveLength(2);
                expect([...tasksPA, ...tasksPB, ...tasksPC]).toHaveLength(
                    Object.values(m.tasks).length,
                );
            });

            it('should assign employees to projects', async () => {
                await repo.assignEmployeeToProject({
                    employee: m.employees.Abigale.id,
                    project: m.projects.PA.id,
                    role: 'developer',
                });
                await repo.assignEmployeeToProject({
                    employee: m.employees.Orpha.id,
                    project: m.projects.PA.id,
                    role: 'manager',
                });
                await repo.assignEmployeeToProject({
                    employee: m.employees.Domenic.id,
                    project: m.projects.PA.id,
                    role: 'developer',
                });
                await repo.assignEmployeeToProject({
                    employee: m.employees.Sylvester.id,
                    project: m.projects.PA.id,
                    role: 'developer',
                });
                //
                await repo.assignEmployeeToProject({
                    employee: m.employees.Orpha.id,
                    project: m.projects.PB.id,
                    role: 'manager',
                });
                await repo.assignEmployeeToProject({
                    employee: m.employees.Abigale.id,
                    project: m.projects.PB.id,
                    role: 'manager',
                });
                await repo.assignEmployeeToProject({
                    employee: m.employees.Marcelino.id,
                    project: m.projects.PB.id,
                    role: 'tester',
                });
                //
                await repo.assignEmployeeToProject({
                    employee: m.employees.Abigale.id,
                    project: m.projects.PC.id,
                    role: 'tester',
                });
                await repo.assignEmployeeToProject({
                    employee: m.employees.Carlo.id,
                    project: m.projects.PC.id,
                    role: 'tester',
                });
                await repo.assignEmployeeToProject({
                    employee: m.employees.Arlo.id,
                    project: m.projects.PC.id,
                    role: 'tester',
                });

                const employeesInPA = await repo.getEmployees({ project: m.projects.PA.id });
                const devsInPA = await repo.getEmployees({
                    project: m.projects.PA.id,
                    role: 'developer',
                });
                const testersInPA = await repo.getEmployees({
                    project: m.projects.PA.id,
                    role: 'tester',
                });
                const managersInPA = await repo.getEmployees({
                    project: m.projects.PA.id,
                    role: 'manager',
                });

                const employeesInPB = await repo.getEmployees({ project: m.projects.PB.id });
                const devsInPB = await repo.getEmployees({
                    project: m.projects.PB.id,
                    role: 'developer',
                });
                const testersInPB = await repo.getEmployees({
                    project: m.projects.PB.id,
                    role: 'tester',
                });
                const managersInPB = await repo.getEmployees({
                    project: m.projects.PB.id,
                    role: 'manager',
                });

                const employeesInPC = await repo.getEmployees({ project: m.projects.PC.id });
                const devsInPC = await repo.getEmployees({
                    project: m.projects.PC.id,
                    role: 'developer',
                });
                const testersInPC = await repo.getEmployees({
                    project: m.projects.PC.id,
                    role: 'tester',
                });
                const managersInPC = await repo.getEmployees({
                    project: m.projects.PC.id,
                    role: 'manager',
                });

                expect(ids(employeesInPA).sort()).toEqual(
                    [
                        m.employees.Abigale.id,
                        m.employees.Orpha.id,
                        m.employees.Domenic.id,
                        m.employees.Sylvester.id,
                    ].sort(),
                );
                expect(ids(devsInPA).sort()).toEqual(
                    [
                        m.employees.Abigale.id,
                        m.employees.Domenic.id,
                        m.employees.Sylvester.id,
                    ].sort(),
                );
                expect(ids(testersInPA).sort()).toEqual([].sort());
                expect(ids(managersInPA).sort()).toEqual([m.employees.Orpha.id].sort());
                //
                expect(ids(employeesInPB).sort()).toEqual(
                    [m.employees.Abigale.id, m.employees.Orpha.id, m.employees.Marcelino.id].sort(),
                );
                expect(ids(devsInPB).sort()).toEqual([].sort());
                expect(ids(testersInPB).sort()).toEqual([m.employees.Marcelino.id].sort());
                expect(ids(managersInPB).sort()).toEqual(
                    [m.employees.Abigale.id, m.employees.Orpha.id].sort(),
                );
                //
                expect(ids(employeesInPC).sort()).toEqual(
                    [m.employees.Abigale.id, m.employees.Carlo.id, m.employees.Arlo.id].sort(),
                );
                expect(ids(devsInPC).sort()).toEqual([].sort());
                expect(ids(testersInPC).sort()).toEqual(
                    [m.employees.Abigale.id, m.employees.Carlo.id, m.employees.Arlo.id].sort(),
                );
                expect(ids(managersInPC).sort()).toEqual([].sort());
            });

            it('should query projects by employee', async () => {
                const idsOfEmployeeProjects = (id: Employee['id']) =>
                    repo.getProjectsByEmployee(id).then(ids).then(sort);

                await expect(idsOfEmployeeProjects(m.employees.Abigale.id)).resolves.toEqual(
                    [m.projects.PA.id, m.projects.PB.id, m.projects.PC.id].sort(),
                );
                await expect(idsOfEmployeeProjects(m.employees.Orpha.id)).resolves.toEqual(
                    [m.projects.PA.id, m.projects.PB.id].sort(),
                );
                await expect(idsOfEmployeeProjects(m.employees.Domenic.id)).resolves.toEqual(
                    [m.projects.PA.id].sort(),
                );
                await expect(idsOfEmployeeProjects(m.employees.Sylvester.id)).resolves.toEqual(
                    [m.projects.PA.id].sort(),
                );
                await expect(idsOfEmployeeProjects(m.employees.Marcelino.id)).resolves.toEqual(
                    [m.projects.PB.id].sort(),
                );
                await expect(idsOfEmployeeProjects(m.employees.Carlo.id)).resolves.toEqual(
                    [m.projects.PC.id].sort(),
                );
                await expect(idsOfEmployeeProjects(m.employees.Arlo.id)).resolves.toEqual(
                    [m.projects.PC.id].sort(),
                );
            });

            it('should query projects by creation date', async () => {
                await expect(
                    repo.getProjectsCreatedAfter(new Date('2010-01-01')).then(ids).then(sort),
                ).resolves.toEqual([m.projects.PB.id, m.projects.PC.id].sort());
            });

            it('should assign tasks to employees', async () => {
                await repo.assignTaskToEmployee(
                    m.projects.PA.id,
                    m.tasks.a.id,
                    m.employees.Abigale.id,
                );
                await repo.assignTaskToEmployee(
                    m.projects.PA.id,
                    m.tasks.b.id,
                    m.employees.Orpha.id,
                );
                await repo.assignTaskToEmployee(
                    m.projects.PA.id,
                    m.tasks.c.id,
                    m.employees.Sylvester.id,
                );
                await repo.assignTaskToEmployee(
                    m.projects.PA.id,
                    m.tasks.d.id,
                    m.employees.Sylvester.id,
                );
                await repo.assignTaskToEmployee(
                    m.projects.PA.id,
                    m.tasks.e.id,
                    m.employees.Sylvester.id,
                );

                const idsOfEmployeeTasks = (id: Employee['id']) =>
                    repo.getTasks(m.projects.PA.id, { assignee: id }).then(ids).then(sort);

                await expect(idsOfEmployeeTasks(m.employees.Abigale.id)).resolves.toEqual([
                    m.tasks.a.id,
                ]);
                await expect(idsOfEmployeeTasks(m.employees.Orpha.id)).resolves.toEqual([
                    m.tasks.b.id,
                ]);
                await expect(idsOfEmployeeTasks(m.employees.Domenic.id)).resolves.toEqual([]);
                await expect(idsOfEmployeeTasks(m.employees.Sylvester.id)).resolves.toEqual(
                    [m.tasks.c.id, m.tasks.d.id, m.tasks.e.id].sort(),
                );
            });

            it('should prevent assigning tasks to employees not in project', async () => {
                await expect(
                    repo.assignTaskToEmployee(m.projects.PA.id, m.tasks.a.id, m.employees.Carlo.id),
                ).rejects.toThrowError();
            });

            it('should allow for changing task statuses', async () => {
                await repo.changeTaskStatus(m.projects.PA.id, m.tasks.a.id, 'in_progress');
                await repo.changeTaskStatus(m.projects.PA.id, m.tasks.b.id, 'in_progress');

                await expect(
                    repo.getTasks(m.projects.PA.id, { status: 'todo' }).then(ids).then(sort),
                ).resolves.toEqual([m.tasks.c.id, m.tasks.d.id, m.tasks.e.id].sort());
                await expect(
                    repo.getTasks(m.projects.PA.id, { status: 'in_progress' }).then(ids).then(sort),
                ).resolves.toEqual([m.tasks.a.id, m.tasks.b.id].sort());
            });

            it('should disallow invalid task status changes', async () => {
                await expect(
                    repo.changeTaskStatus(m.projects.PA.id, m.tasks.b.id, 'done'),
                ).rejects.toThrowError();
            });

            it('should allow for finishing projects', async () => {
                await repo.finishProject(m.projects.PA.id);

                await expect(repo.getFinishedProjects().then(ids).then(sort)).resolves.toEqual([
                    m.projects.PA.id,
                ]);
            });
        });
    });
});

function ids<T extends { id: unknown }>(items: T[]): Array<T['id']> {
    return items.map(({ id }) => id);
}

function sort<T>(items: T[]): T[] {
    return [...items].sort();
}

function mocks() {
    const projects = {
        PA: {
            id: 'PA',
            name: 'project-a',
            createdDate: '2005-10-31',
        },
        PB: {
            id: 'PB',
            name: 'project-b',
            createdDate: '2014-04-05',
        },
        PC: {
            id: 'PC',
            name: 'project-c',
            createdDate: '2021-01-01',
        },
    } satisfies Record<string, Project>;

    const employees = {
        Marcelino: {
            id: 'Marcelino',
            firstName: 'Marcelino',
            lastName: 'Conn',
        },
        Orpha: {
            id: 'Orpha',
            firstName: 'Orpha',
            lastName: 'Gulgowski',
        },
        Abigale: {
            id: 'Abigale',
            firstName: 'Abigale',
            lastName: 'Kshlerin',
        },
        Domenic: {
            id: 'Domenic',
            firstName: 'Domenic',
            lastName: 'Schneider',
        },
        Arlo: {
            id: 'Arlo',
            firstName: 'Arlo',
            lastName: 'Ankunding',
        },
        Sylvester: {
            id: 'Sylvester',
            firstName: 'Sylvester',
            lastName: 'Fay',
        },
        Carlo: {
            id: 'Carlo',
            firstName: 'Carlo',
            lastName: 'Baumbach',
        },
    } satisfies Record<string, Employee>;

    const tasks = {
        a: {
            id: 'a',
            title: 'Task A',
            description: 'Dolores aliquid consequuntur magnam.',
            project: projects.PA.id,
            status: 'todo',
        },
        b: {
            id: 'b',
            title: 'Task B',
            description: 'Dolores aliquid consequuntur magnam.',
            project: projects.PA.id,
            status: 'todo',
        },
        c: {
            id: 'c',
            title: 'Task C',
            description: 'Dolores aliquid consequuntur magnam.',
            project: projects.PA.id,
            status: 'todo',
        },
        d: {
            id: 'd',
            title: 'Task D',
            description: 'Dolores aliquid consequuntur magnam.',
            project: projects.PA.id,
            status: 'todo',
        },
        e: {
            id: 'e',
            title: 'Task E',
            description: 'Dolores aliquid consequuntur magnam.',
            project: projects.PA.id,
            status: 'todo',
        },
        f: {
            id: 'f',
            title: 'Task F',
            description: 'Dolores aliquid consequuntur magnam.',
            project: projects.PB.id,
            status: 'todo',
        },
        g: {
            id: 'g',
            title: 'Task G',
            description: 'Dolores aliquid consequuntur magnam.',
            project: projects.PB.id,
            status: 'todo',
        },
        h: {
            id: 'h',
            title: 'Task H',
            description: 'Dolores aliquid consequuntur magnam.',
            project: projects.PB.id,
            status: 'todo',
        },
        i: {
            id: 'I',
            title: 'Task I',
            description: 'Dolores aliquid consequuntur magnam.',
            project: projects.PB.id,
            status: 'todo',
        },
        j: {
            id: 'j',
            title: 'Task J',
            description: 'Dolores aliquid consequuntur magnam.',
            project: projects.PC.id,
            status: 'todo',
        },
        k: {
            id: 'k',
            title: 'Task K',
            description: 'Dolores aliquid consequuntur magnam.',
            project: projects.PC.id,
            status: 'todo',
        },
    } satisfies Record<string, Task>;

    return { projects, employees, tasks };
}
