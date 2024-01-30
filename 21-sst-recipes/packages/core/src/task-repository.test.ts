import { describe, it, expect, afterAll } from 'vitest';
import DynamoDB from 'aws-sdk/clients/dynamodb';
import { Table } from 'sst/node/table';
import { Config } from 'sst/node/config';
import assert from 'assert';

import { TaskRepository, Project, Employee, Task } from './task-repository';

assert(Config.STAGE.startsWith('dev'), 'Cannot run tests on non-dev stages!');

describe('task-repository', () => {
    const client = new DynamoDB.DocumentClient();
    const repo = new TaskRepository(client, Table['test-todo-table'].tableName);

    const mockProjects = {
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

    const mockEmployees = {
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

    const mockTasks = {
        a: {
            id: 'a',
            title: 'Task A',
            description: 'Dolores aliquid consequuntur magnam.',
            project: mockProjects.PA.id,
            status: 'todo',
        },
        b: {
            id: 'b',
            title: 'Task B',
            description: 'Dolores aliquid consequuntur magnam.',
            project: mockProjects.PA.id,
            status: 'todo',
        },
        c: {
            id: 'c',
            title: 'Task C',
            description: 'Dolores aliquid consequuntur magnam.',
            project: mockProjects.PA.id,
            status: 'todo',
        },
        d: {
            id: 'd',
            title: 'Task D',
            description: 'Dolores aliquid consequuntur magnam.',
            project: mockProjects.PA.id,
            status: 'todo',
        },
        e: {
            id: 'e',
            title: 'Task E',
            description: 'Dolores aliquid consequuntur magnam.',
            project: mockProjects.PA.id,
            status: 'todo',
        },
        f: {
            id: 'f',
            title: 'Task F',
            description: 'Dolores aliquid consequuntur magnam.',
            project: mockProjects.PB.id,
            status: 'todo',
        },
        g: {
            id: 'g',
            title: 'Task G',
            description: 'Dolores aliquid consequuntur magnam.',
            project: mockProjects.PB.id,
            status: 'todo',
        },
        h: {
            id: 'h',
            title: 'Task H',
            description: 'Dolores aliquid consequuntur magnam.',
            project: mockProjects.PB.id,
            status: 'todo',
        },
        i: {
            id: 'I',
            title: 'Task I',
            description: 'Dolores aliquid consequuntur magnam.',
            project: mockProjects.PB.id,
            status: 'todo',
        },
        j: {
            id: 'j',
            title: 'Task J',
            description: 'Dolores aliquid consequuntur magnam.',
            project: mockProjects.PC.id,
            status: 'todo',
        },
        k: {
            id: 'k',
            title: 'Task K',
            description: 'Dolores aliquid consequuntur magnam.',
            project: mockProjects.PC.id,
            status: 'todo',
        },
    } satisfies Record<string, Task>;

    afterAll(() => repo._purge());

    it('should insert projects', async () => {
        const { id: idA } = await repo.createProject(mockProjects.PA);
        const { id: idB } = await repo.createProject(mockProjects.PB);
        const { id: idC } = await repo.createProject(mockProjects.PC);

        const projects = await repo.getAllProjects();
        const projectIds = projects.map(({ id }) => id);

        expect(projects).toHaveLength(3);
        expect(projectIds).toContain(idA);
        expect(projectIds).toContain(idB);
        expect(projectIds).toContain(idC);
    });

    it('should insert employees', async () => {
        await repo.createEmployee(mockEmployees.Marcelino);
        await repo.createEmployee(mockEmployees.Orpha);
        await repo.createEmployee(mockEmployees.Abigale);
        await repo.createEmployee(mockEmployees.Domenic);
        await repo.createEmployee(mockEmployees.Arlo);
        await repo.createEmployee(mockEmployees.Sylvester);
        await repo.createEmployee(mockEmployees.Carlo);

        const employees = await repo.getAllEmployees();

        expect(employees).toHaveLength(7);
    });

    it('should insert tasks', async () => {
        await Promise.all(Object.values(mockTasks).map(t => repo.createTask(t)));

        const tasksPA = await repo.getAllTasks(mockProjects.PA.id);
        const tasksPB = await repo.getAllTasks(mockProjects.PB.id);
        const tasksPC = await repo.getAllTasks(mockProjects.PC.id);

        expect(tasksPA).toHaveLength(5);
        expect(tasksPB).toHaveLength(4);
        expect(tasksPC).toHaveLength(2);
        expect([...tasksPA, ...tasksPB, ...tasksPC]).toHaveLength(Object.values(mockTasks).length);
    });

    it('should assign employees to projects', async () => {
        await repo.assignEmployeeToProject({
            employee: mockEmployees.Abigale.id,
            project: mockProjects.PA.id,
            role: 'developer',
        });
        await repo.assignEmployeeToProject({
            employee: mockEmployees.Orpha.id,
            project: mockProjects.PA.id,
            role: 'manager',
        });
        await repo.assignEmployeeToProject({
            employee: mockEmployees.Domenic.id,
            project: mockProjects.PA.id,
            role: 'developer',
        });
        await repo.assignEmployeeToProject({
            employee: mockEmployees.Sylvester.id,
            project: mockProjects.PA.id,
            role: 'developer',
        });
        //
        await repo.assignEmployeeToProject({
            employee: mockEmployees.Orpha.id,
            project: mockProjects.PB.id,
            role: 'manager',
        });
        await repo.assignEmployeeToProject({
            employee: mockEmployees.Abigale.id,
            project: mockProjects.PB.id,
            role: 'manager',
        });
        await repo.assignEmployeeToProject({
            employee: mockEmployees.Marcelino.id,
            project: mockProjects.PB.id,
            role: 'tester',
        });
        //
        await repo.assignEmployeeToProject({
            employee: mockEmployees.Abigale.id,
            project: mockProjects.PC.id,
            role: 'tester',
        });
        await repo.assignEmployeeToProject({
            employee: mockEmployees.Carlo.id,
            project: mockProjects.PC.id,
            role: 'tester',
        });
        await repo.assignEmployeeToProject({
            employee: mockEmployees.Arlo.id,
            project: mockProjects.PC.id,
            role: 'tester',
        });

        const employeesInPA = await repo.getEmployees({ project: mockProjects.PA.id });
        const devsInPA = await repo.getEmployees({
            project: mockProjects.PA.id,
            role: 'developer',
        });
        const testersInPA = await repo.getEmployees({
            project: mockProjects.PA.id,
            role: 'tester',
        });
        const managersInPA = await repo.getEmployees({
            project: mockProjects.PA.id,
            role: 'manager',
        });

        const employeesInPB = await repo.getEmployees({ project: mockProjects.PB.id });
        const devsInPB = await repo.getEmployees({
            project: mockProjects.PB.id,
            role: 'developer',
        });
        const testersInPB = await repo.getEmployees({
            project: mockProjects.PB.id,
            role: 'tester',
        });
        const managersInPB = await repo.getEmployees({
            project: mockProjects.PB.id,
            role: 'manager',
        });

        const employeesInPC = await repo.getEmployees({ project: mockProjects.PC.id });
        const devsInPC = await repo.getEmployees({
            project: mockProjects.PC.id,
            role: 'developer',
        });
        const testersInPC = await repo.getEmployees({
            project: mockProjects.PC.id,
            role: 'tester',
        });
        const managersInPC = await repo.getEmployees({
            project: mockProjects.PC.id,
            role: 'manager',
        });

        expect(ids(employeesInPA).sort()).toEqual(
            [
                mockEmployees.Abigale.id,
                mockEmployees.Orpha.id,
                mockEmployees.Domenic.id,
                mockEmployees.Sylvester.id,
            ].sort(),
        );
        expect(ids(devsInPA).sort()).toEqual(
            [mockEmployees.Abigale.id, mockEmployees.Domenic.id, mockEmployees.Sylvester.id].sort(),
        );
        expect(ids(testersInPA).sort()).toEqual([].sort());
        expect(ids(managersInPA).sort()).toEqual([mockEmployees.Orpha.id].sort());
        //
        expect(ids(employeesInPB).sort()).toEqual(
            [mockEmployees.Abigale.id, mockEmployees.Orpha.id, mockEmployees.Marcelino.id].sort(),
        );
        expect(ids(devsInPB).sort()).toEqual([].sort());
        expect(ids(testersInPB).sort()).toEqual([mockEmployees.Marcelino.id].sort());
        expect(ids(managersInPB).sort()).toEqual(
            [mockEmployees.Abigale.id, mockEmployees.Orpha.id].sort(),
        );
        //
        expect(ids(employeesInPC).sort()).toEqual(
            [mockEmployees.Abigale.id, mockEmployees.Carlo.id, mockEmployees.Arlo.id].sort(),
        );
        expect(ids(devsInPC).sort()).toEqual([].sort());
        expect(ids(testersInPC).sort()).toEqual(
            [mockEmployees.Abigale.id, mockEmployees.Carlo.id, mockEmployees.Arlo.id].sort(),
        );
        expect(ids(managersInPC).sort()).toEqual([].sort());
    });

    it('should query projects by employee', async () => {
        const idsOfEmployeeProjects = (id: Employee['id']) =>
            repo.getProjectsByEmployee(id).then(ids).then(sort);

        await expect(idsOfEmployeeProjects(mockEmployees.Abigale.id)).resolves.toEqual(
            [mockProjects.PA.id, mockProjects.PB.id, mockProjects.PC.id].sort(),
        );
        await expect(idsOfEmployeeProjects(mockEmployees.Orpha.id)).resolves.toEqual(
            [mockProjects.PA.id, mockProjects.PB.id].sort(),
        );
        await expect(idsOfEmployeeProjects(mockEmployees.Domenic.id)).resolves.toEqual(
            [mockProjects.PA.id].sort(),
        );
        await expect(idsOfEmployeeProjects(mockEmployees.Sylvester.id)).resolves.toEqual(
            [mockProjects.PA.id].sort(),
        );
        await expect(idsOfEmployeeProjects(mockEmployees.Marcelino.id)).resolves.toEqual(
            [mockProjects.PB.id].sort(),
        );
        await expect(idsOfEmployeeProjects(mockEmployees.Carlo.id)).resolves.toEqual(
            [mockProjects.PC.id].sort(),
        );
        await expect(idsOfEmployeeProjects(mockEmployees.Arlo.id)).resolves.toEqual(
            [mockProjects.PC.id].sort(),
        );
    });

    it('should query projects by creation date', async () => {
        await expect(
            repo.getProjectsCreatedAfter(new Date('2010-01-01')).then(ids).then(sort),
        ).resolves.toEqual([mockProjects.PB.id, mockProjects.PC.id].sort());
    });

    it('should assign tasks to employees', async () => {
        await repo.assignTaskToEmployee(
            mockProjects.PA.id,
            mockTasks.a.id,
            mockEmployees.Abigale.id,
        );
        await repo.assignTaskToEmployee(mockProjects.PA.id, mockTasks.b.id, mockEmployees.Orpha.id);
        await repo.assignTaskToEmployee(
            mockProjects.PA.id,
            mockTasks.c.id,
            mockEmployees.Sylvester.id,
        );
        await repo.assignTaskToEmployee(
            mockProjects.PA.id,
            mockTasks.d.id,
            mockEmployees.Sylvester.id,
        );
        await repo.assignTaskToEmployee(
            mockProjects.PA.id,
            mockTasks.e.id,
            mockEmployees.Sylvester.id,
        );

        const idsOfEmployeeTasks = (id: Employee['id']) =>
            repo.getTasks(mockProjects.PA.id, { assignee: id }).then(ids).then(sort);

        await expect(idsOfEmployeeTasks(mockEmployees.Abigale.id)).resolves.toEqual([
            mockTasks.a.id,
        ]);
        await expect(idsOfEmployeeTasks(mockEmployees.Orpha.id)).resolves.toEqual([mockTasks.b.id]);
        await expect(idsOfEmployeeTasks(mockEmployees.Domenic.id)).resolves.toEqual([]);
        await expect(idsOfEmployeeTasks(mockEmployees.Sylvester.id)).resolves.toEqual(
            [mockTasks.c.id, mockTasks.d.id, mockTasks.e.id].sort(),
        );
    });

    it('should prevent assigning tasks to employees not in project', async () => {
        await expect(
            repo.assignTaskToEmployee(mockProjects.PA.id, mockTasks.a.id, mockEmployees.Carlo.id),
        ).rejects.toThrowError();
    });

    it('should allow for changing task statuses', async () => {
        await repo.changeTaskStatus(mockProjects.PA.id, mockTasks.a.id, 'in_progress');
        await repo.changeTaskStatus(mockProjects.PA.id, mockTasks.b.id, 'in_progress');

        await expect(
            repo.getTasks(mockProjects.PA.id, { status: 'todo' }).then(ids).then(sort),
        ).resolves.toEqual([mockTasks.c.id, mockTasks.d.id, mockTasks.e.id].sort());
        await expect(
            repo.getTasks(mockProjects.PA.id, { status: 'in_progress' }).then(ids).then(sort),
        ).resolves.toEqual([mockTasks.a.id, mockTasks.b.id].sort());
    });

    it('should disallow invalid task status changes', async () => {
        await expect(
            repo.changeTaskStatus(mockProjects.PA.id, mockTasks.b.id, 'done'),
        ).rejects.toThrowError();
    });

    it('should allow for finishing projects', async () => {
        await repo.finishProject(mockProjects.PA.id);

        await expect(repo.getFinishedProjects().then(ids).then(sort)).resolves.toEqual([
            mockProjects.PA.id,
        ]);
    });
});

function ids<T extends { id: unknown }>(items: T[]): Array<T['id']> {
    return items.map(({ id }) => id);
}

function sort<T>(items: T[]): T[] {
    return [...items].sort();
}
