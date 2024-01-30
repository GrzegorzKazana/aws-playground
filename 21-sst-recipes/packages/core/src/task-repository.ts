import DynamoDB from 'aws-sdk/clients/dynamodb';
import { Entity, Service, CreateEntityItem, EntityItem, EntityIdentifiers } from 'electrodb';
import { randomUUID } from 'crypto';

/**
 * Access patterns:
 * get all projects,
 * get all finished projects
 * get all projects in progress
 * get all projects created after
 */

export const ProjectEntity = new Entity({
    model: {
        entity: 'project',
        service: 'todolist',
        version: '1',
    },
    attributes: {
        id: {
            type: 'string',
            required: true,
            default: () => randomUUID(),
        },
        name: {
            type: 'string',
            required: true,
        },
        createdDate: {
            type: 'string',
            required: true,
        },
        finishedDate: {
            type: 'string',
        },
    },
    indexes: {
        info: {
            scope: 'project',
            pk: {
                field: 'pk',
                composite: [],
            },
            sk: {
                field: 'sk',
                composite: ['id'],
            },
        },
        byFinished: {
            index: 'lsi1',
            scope: 'project',
            condition: ({ finishedDate }) => !!finishedDate,
            pk: {
                field: 'pk',
                composite: [],
            },
            sk: {
                field: 'lsi1sk',
                composite: ['finishedDate', 'id'],
            },
        },
        byCreatedDate: {
            index: 'gsi1',
            scope: 'project',
            pk: {
                field: 'gsi1pk',
                composite: [],
            },
            sk: {
                field: 'gsi1sk',
                composite: ['createdDate', 'id'],
            },
        },
    },
});

/**
 * Access patterns:
 * get all tasks within a project
 * get tasks of certain status within a projects
 * get all tasks assigned to employee
 * get tasks of certain status assigned to employee
 */

export const TaskEntity = new Entity({
    model: {
        entity: 'task',
        service: 'todolist',
        version: '1',
    },
    attributes: {
        id: {
            type: 'string',
            required: true,
            default: () => randomUUID(),
        },
        project: {
            type: 'string',
            required: true,
        },
        title: {
            type: 'string',
            required: true,
        },
        description: {
            type: 'string',
            required: true,
        },
        status: {
            type: ['todo', 'in_progress', 'qa', 'done'] as const,
            required: true,
            default: () => 'todo',
        },
        assignee: {
            type: 'string',
        },
    },
    indexes: {
        byProject: {
            pk: {
                field: 'pk',
                composite: ['project'],
            },
            sk: {
                field: 'sk',
                composite: ['id'],
            },
        },
        byStatusInProject: {
            index: 'lsi1',
            pk: {
                field: 'pk',
                composite: ['project'],
            },
            sk: {
                field: 'lsi1sk',
                composite: ['status', 'id'],
            },
        },
        byAssignee: {
            index: 'gsi1',
            pk: {
                field: 'gsi1pk',
                composite: ['assignee'],
            },
            sk: {
                field: 'gsi1sk',
                composite: ['project', 'id'],
            },
        },
    },
});

/**
 * Access patterns:
 * get all employees,
 */

export const EmployeeEntity = new Entity({
    model: {
        entity: 'employee',
        service: 'todolist',
        version: '1',
    },
    attributes: {
        id: {
            type: 'string',
            required: true,
            default: () => randomUUID(),
        },
        firstName: { type: 'string', required: true },
        lastName: { type: 'string', required: true },
    },
    indexes: {
        info: {
            scope: 'employee',
            pk: {
                field: 'pk',
                composite: [],
            },
            sk: {
                field: 'sk',
                composite: ['id'],
            },
        },
    },
});

/**
 * Access patterns:
 * get members of certain project
 * get members of certain role in certain project
 * get projects of certain employee
 */

export const ProjectMemberEntity = new Entity({
    model: {
        entity: 'projectmember',
        service: 'todolist',
        version: '1',
    },
    attributes: {
        employee: {
            type: 'string',
            required: true,
        },
        project: {
            type: 'string',
            required: true,
        },
        role: {
            type: ['manager', 'developer', 'tester'] as const,
            required: true,
        },
    },
    indexes: {
        byProject: {
            pk: {
                field: 'pk',
                composite: ['project'],
            },
            sk: {
                field: 'sk',
                composite: ['employee'],
            },
        },
        byEmployee: {
            index: 'gsi1',
            pk: {
                field: 'gsi1pk',
                composite: ['employee'],
            },
            sk: {
                field: 'gsi1sk',
                composite: ['project'],
            },
        },
        byRoleInProject: {
            index: 'lsi1',
            pk: {
                field: 'pk',
                composite: ['project'],
            },
            sk: {
                field: 'lsi1sk',
                composite: ['role', 'employee'],
            },
        },
    },
});

export type Project = EntityItem<typeof ProjectEntity>;
export type Task = EntityItem<typeof TaskEntity>;
export type Employee = EntityItem<typeof EmployeeEntity>;
export type ProjectMember = EntityItem<typeof ProjectMemberEntity>;

export type ProjectId = string;
export type TaskId = string;
export type EmployeeId = string;

export class TaskRepository {
    constructor(
        private readonly client: DynamoDB.DocumentClient,
        private readonly table: string,
        private readonly service = new Service(
            {
                project: ProjectEntity,
                task: TaskEntity,
                members: ProjectMemberEntity,
                employee: EmployeeEntity,
            },
            { table, client },
        ),
    ) {}

    createProject(project: CreateEntityItem<typeof ProjectEntity>) {
        return this.service.entities.project
            .create(project)
            .go()
            .then(({ data }) => data);
    }

    createTask(task: CreateEntityItem<typeof TaskEntity>) {
        return this.service.entities.task
            .create(task)
            .go()
            .then(({ data }) => data);
    }

    createEmployee(employee: CreateEntityItem<typeof EmployeeEntity>) {
        return this.service.entities.employee
            .create(employee)
            .go()
            .then(({ data }) => data);
    }

    assignEmployeeToProject({
        project,
        employee,
        role,
    }: CreateEntityItem<typeof ProjectMemberEntity>) {
        return this.service.entities.members
            .put({ project, employee, role })
            .go()
            .then(({ data }) => data);
    }

    unassignEmployeeFromProject({
        employee,
        project,
    }: EntityIdentifiers<typeof ProjectMemberEntity>) {
        return this.service.entities.members
            .delete({ employee, project })
            .go()
            .then(({ data }) => data);
    }

    changeTaskStatus(project: ProjectId, task: TaskId, status: Task['status']) {
        const allowedTransitions = {
            todo: [],
            in_progress: ['todo', 'qa', 'done'],
            qa: ['in_progress'],
            done: ['qa'],
        } satisfies Record<Task['status'], Array<Task['status']>>;

        const allowedTransitionsForStatus: Task['status'][] = allowedTransitions[status];

        if (!allowedTransitionsForStatus.length)
            return Promise.reject(new Error(`Cannot transition back to ${status}`));

        return this.service.entities.task
            .patch({ id: task, project })
            .set({ status })
            .where((attrs, op) =>
                allowedTransitionsForStatus.map(s => op.eq(attrs.status, s)).join(' OR '),
            )
            .go()
            .then(({ data }) => data);
    }

    async assignTaskToEmployee(project: ProjectId, task: TaskId, employee: EmployeeId) {
        const isAssignedToProject = await this.service.entities.members
            .get({ project, employee })
            .go();

        if (!isAssignedToProject.data)
            return Promise.reject(new Error('Cannot assign task to employee not in project!'));

        return this.service.entities.task
            .patch({ id: task, project })
            .set({ assignee: employee })
            .go()
            .then(({ data }) => data);
    }

    finishProject(project: ProjectId, finishedDate = new Date().toISOString()) {
        return this.service.entities.project
            .patch({ id: project })
            .set({ finishedDate })
            .go()
            .then(({ data }) => data);
    }

    getProjectDetails(project: ProjectId) {
        return this.service.entities.project
            .get({ id: project })
            .go()
            .then(({ data }) => data);
    }

    getAllProjects() {
        return this.service.entities.project.query
            .info({})
            .go()
            .then(({ data }) => data);
    }

    getFinishedProjects() {
        return this.service.entities.project.query
            .byFinished({})
            .go()
            .then(({ data }) => data);
    }

    getProjectsInProgress() {
        return this.service.entities.project.query
            .info({})
            .where((attrs, op) => op.notExists(attrs.finishedDate))
            .go()
            .then(({ data }) => data);
    }

    getProjectsCreatedAfter(time: Date) {
        return this.service.entities.project.query
            .byCreatedDate({})
            .gt({ createdDate: time.toISOString() })
            .go()
            .then(({ data }) => data);
    }

    getProjectsByEmployee(employee: EmployeeId) {
        return this.service.entities.members.query
            .byEmployee({ employee })
            .go()
            .then(({ data }) =>
                this.service.entities.project.get(data.map(({ project: id }) => ({ id }))).go(),
            )
            .then(({ data }) => data);
    }

    getAllTasks(project: ProjectId) {
        return this.service.entities.task.query
            .byProject({ project })
            .go()
            .then(({ data }) => data);
    }

    getTasks(
        project: ProjectId,
        { status, assignee }: Partial<{ status: Task['status']; assignee: EmployeeId }> = {},
    ) {
        // let electroDB select the index (.find)
        // since we are always providing the pk (project or assignee)
        // at worst it will do query+filter (no scans)
        return this.service.entities.task
            .find({ project, status, assignee })
            .go()
            .then(({ data }) => data);
    }

    getTaskDetails(project: ProjectId, task: TaskId) {
        return this.service.entities.task
            .get({ id: task, project })
            .go()
            .then(({ data }) => data);
    }

    getAllEmployees() {
        return this.service.entities.employee.query
            .info({})
            .go()
            .then(({ data }) => data);
    }

    getEmployees({ project, role }: { project: ProjectId; role?: ProjectMember['role'] }) {
        return this.service.entities.members
            .find({ project, role })
            .go()
            .then(({ data }) =>
                this.service.entities.employee.get(data.map(({ employee: id }) => ({ id }))).go(),
            )
            .then(({ data }) => data);
    }

    getEmployeeDetails(employee: EmployeeId) {
        return this.service.entities.employee
            .get({ id: employee })
            .go()
            .then(({ data }) => data);
    }

    deleteEmployee(employee: EmployeeId) {
        return this.deleteEmployees([employee]);
    }

    deleteEmployees(employees: EmployeeId[]) {
        return TaskRepository.exhaustUnprocessedKeys<typeof EmployeeEntity>(
            employees.map(id => ({ id })),
            k => this.service.entities.employee.delete(k).go(),
        );
    }

    async deleteProject(project: ProjectId) {
        const tasks = await this.getTasks(project);
        const members = await this.service.entities.members.query.byProject({ project }).go();

        await TaskRepository.exhaustUnprocessedKeys<typeof TaskEntity>(tasks, k =>
            this.service.entities.task.delete(k).go(),
        );
        await TaskRepository.exhaustUnprocessedKeys<typeof ProjectMemberEntity>(members.data, k =>
            this.service.entities.members.delete(k).go(),
        );

        return this.service.entities.project.delete({ id: project }).go();
    }

    /** runs table scan use only in tests and small datasets! */
    async _purge() {
        const employees = await this.service.entities.employee.scan.go({});
        const projects = await this.service.entities.project.scan.go({});
        const members = await this.service.entities.members.scan.go({});
        const tasks = await this.service.entities.task.scan.go({});

        await TaskRepository.exhaustUnprocessedKeys<typeof EmployeeEntity>(
            employees.data,
            async k => this.service.entities.employee.delete(k).go(),
        );
        await TaskRepository.exhaustUnprocessedKeys<typeof ProjectEntity>(projects.data, async k =>
            this.service.entities.project.delete(k).go(),
        );
        await TaskRepository.exhaustUnprocessedKeys<typeof ProjectMemberEntity>(
            members.data,
            async k => this.service.entities.members.delete(k).go(),
        );
        await TaskRepository.exhaustUnprocessedKeys<typeof TaskEntity>(tasks.data, async k =>
            this.service.entities.task.delete(k).go(),
        );
    }

    static exhaustUnprocessedKeys<E extends Entity<any, any, any, any>>(
        keys: EntityIdentifiers<E>[],
        op: (k: EntityIdentifiers<E>[]) => Promise<{ unprocessed: EntityIdentifiers<E>[] }>,
    ): Promise<Record<string, never>> {
        return keys.length
            ? op(keys).then(({ unprocessed }) =>
                  this.wait(100).then(() => this.exhaustUnprocessedKeys(unprocessed, op)),
              )
            : Promise.resolve({});
    }

    static wait(n: number) {
        return new Promise(res => setTimeout(res, n));
    }
}
