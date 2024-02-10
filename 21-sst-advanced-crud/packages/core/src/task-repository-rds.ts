import { Pool } from 'pg';
import { Kysely, PostgresDialect, Selectable } from 'kysely';

import type {
    EmployeeId,
    TaskRepository,
    TaskId,
    ProjectId,
    Project,
    Task,
    Employee,
    ProjectMember,
} from './task-repository';

import type { ColumnType } from 'kysely';
import { isNotFalsy } from './utils';

export type Generated<T> = T extends ColumnType<infer S, infer I, infer U>
    ? ColumnType<S, I | undefined, U>
    : ColumnType<T, T | undefined, T>;

export type Timestamp = ColumnType<Date, Date | string, Date | string>;

export interface DBEmployee {
    id: Generated<EmployeeId>;
    firstName: string;
    lastName: string;
}

export interface DBProject {
    id: Generated<ProjectId>;
    name: string;
    createdDate: Timestamp;
    finishedDate: Timestamp | null;
}

export interface DBProjectMember {
    employee: EmployeeId;
    project: ProjectId;
    role: ProjectMember['role'];
}

export interface DBTask {
    id: Generated<TaskId>;
    project: ProjectId;
    title: string;
    description: string;
    status: Task['status'];
    assignee: EmployeeId | null;
}

export interface DB {
    employee: DBEmployee;
    project: DBProject;
    project_member: DBProjectMember;
    task: DBTask;
}

export class RdsTaskRepository implements TaskRepository {
    constructor(
        private readonly pool: Pool,
        private readonly db = new Kysely<DB>({ dialect: new PostgresDialect({ pool }) }),
    ) {}

    createProject(project: Omit<Project, 'id'>): Promise<Project> {
        return this.db
            .insertInto('project')
            .values(project)
            .returningAll()
            .executeTakeFirstOrThrow()
            .then(formatProject);
    }

    createTask(task: Omit<Task, 'id'>): Promise<Task> {
        return this.db
            .insertInto('task')
            .values(task)
            .returningAll()
            .executeTakeFirstOrThrow()
            .then(formatTask);
    }

    createEmployee(employee: Omit<Employee, 'id'>): Promise<Employee> {
        return this.db
            .insertInto('employee')
            .values(employee)
            .returningAll()
            .executeTakeFirstOrThrow();
    }

    assignEmployeeToProject(member: Omit<ProjectMember, 'id'>): Promise<ProjectMember> {
        return this.db
            .insertInto('project_member')
            .values(member)
            .returningAll()
            .executeTakeFirstOrThrow();
    }

    unassignEmployeeFromProject(
        member: Pick<ProjectMember, 'project' | 'employee'>,
    ): Promise<Partial<ProjectMember>> {
        return this.db
            .deleteFrom('project_member')
            .where('employee', '=', member.employee)
            .where('project', '=', member.project)
            .returningAll()
            .executeTakeFirstOrThrow();
    }

    changeTaskStatus(
        project: string,
        task: string,
        status: 'todo' | 'in_progress' | 'qa' | 'done',
    ): Promise<Partial<Task>> {
        const allowedTransitions = {
            todo: [],
            in_progress: ['todo', 'qa', 'done'],
            qa: ['in_progress'],
            done: ['qa'],
        } satisfies Record<Task['status'], Array<Task['status']>>;

        const allowedTransitionsForStatus: Task['status'][] = allowedTransitions[status];

        if (!allowedTransitionsForStatus.length)
            return Promise.reject(new Error(`Cannot transition back to ${status}`));

        return this.db
            .updateTable('task')
            .where('project', '=', project)
            .where('id', '=', task)
            .where('status', 'in', allowedTransitionsForStatus)
            .set({ status })
            .returningAll()
            .executeTakeFirstOrThrow()
            .then(formatTask);
    }

    assignTaskToEmployee(project: string, task: string, employee: string): Promise<Partial<Task>> {
        return this.db
            .updateTable('task')
            .from('project_member')
            .whereRef('task.project', '=', 'project_member.project')
            .where('task.project', '=', project)
            .where('project_member.employee', '=', employee)
            .where('task.id', '=', task)
            .set({ assignee: employee })
            .returning([
                'task.id',
                'task.title',
                'task.status',
                'task.project',
                'task.description',
                'task.assignee',
            ])
            .executeTakeFirstOrThrow()
            .then(formatTask);
    }

    finishProject(
        project: string,
        finishedDate = new Date().toISOString(),
    ): Promise<Partial<Project>> {
        return this.db
            .updateTable('project')
            .where('id', '=', project)
            .set({ finishedDate })
            .returningAll()
            .executeTakeFirstOrThrow()
            .then(formatProject);
    }

    getProjectDetails(project: string): Promise<Project | null> {
        return this.db
            .selectFrom('project')
            .selectAll()
            .where('id', '=', project)
            .executeTakeFirst()
            .then(p => (p ? formatProject(p) : null));
    }

    getAllProjects(): Promise<Project[]> {
        return this.db
            .selectFrom('project')
            .selectAll()
            .execute()
            .then(p => p.map(formatProject));
    }

    getFinishedProjects(): Promise<Project[]> {
        return this.db
            .selectFrom('project')
            .selectAll()
            .where('finishedDate', 'is not', null)
            .execute()
            .then(p => p.map(formatProject));
    }

    getProjectsInProgress(): Promise<Project[]> {
        return this.db
            .selectFrom('project')
            .selectAll()
            .where('finishedDate', 'is', null)
            .execute()
            .then(p => p.map(formatProject));
    }

    getProjectsCreatedAfter(time: Date): Promise<Project[]> {
        return this.db
            .selectFrom('project')
            .selectAll()
            .where('createdDate', '>', time)
            .execute()
            .then(p => p.map(formatProject));
    }

    getProjectsByEmployee(employee: string): Promise<Project[]> {
        return this.db
            .selectFrom('project')
            .innerJoin('project_member', 'project.id', 'project_member.project')
            .where('project_member.employee', '=', employee)
            .selectAll()
            .execute()
            .then(p => p.map(formatProject));
    }

    getAllTasks(project: string): Promise<Task[]> {
        return this.db
            .selectFrom('task')
            .selectAll()
            .where('project', '=', project)
            .execute()
            .then(p => p.map(formatTask));
    }

    getTasks(
        project: string,
        {
            status,
            assignee,
        }: Partial<{ status: 'todo' | 'in_progress' | 'qa' | 'done'; assignee: string }>,
    ): Promise<Task[]> {
        return this.db
            .selectFrom('task')
            .selectAll()
            .where('project', '=', project)
            .where(eb =>
                eb.and(
                    [
                        !!status && eb.cmpr('status', '=', status),
                        !!assignee && eb.cmpr('assignee', '=', assignee),
                    ].filter(isNotFalsy),
                ),
            )
            .execute()
            .then(p => p.map(formatTask));
    }

    getTaskDetails(project: string, task: string): Promise<Task | null> {
        return this.db
            .selectFrom('task')
            .selectAll()
            .where('id', '=', task)
            .where('project', '=', project)
            .executeTakeFirst()
            .then(t => (t ? formatTask(t) : null));
    }

    getAllEmployees(): Promise<Employee[]> {
        return this.db.selectFrom('employee').selectAll().execute();
    }

    getEmployees({
        project,
        role,
    }: {
        project: string;
        role?: 'manager' | 'developer' | 'tester' | undefined;
    }): Promise<Employee[]> {
        return this.db
            .selectFrom('employee')
            .innerJoin('project_member', 'employee.id', 'project_member.employee')
            .selectAll()
            .where(eb =>
                eb.and(
                    [
                        !!project && eb.cmpr('project', '=', project),
                        !!role && eb.cmpr('role', '=', role),
                    ].filter(isNotFalsy),
                ),
            )
            .execute();
    }

    getEmployeeDetails(employee: string): Promise<Employee | null> {
        return this.db
            .selectFrom('employee')
            .selectAll()
            .where('id', '=', employee)
            .executeTakeFirst()
            .then(e => e || null);
    }

    deleteEmployee(employee: string): Promise<Partial<Employee>> {
        return this.db
            .deleteFrom('employee')
            .where('id', '=', employee)
            .returningAll()
            .executeTakeFirstOrThrow();
    }

    deleteEmployees(employees: string[]): Promise<unknown> {
        return this.db.deleteFrom('employee').where('id', 'in', employees).execute();
    }

    deleteProject(project: string): Promise<Partial<Project>> {
        return this.db
            .deleteFrom('project')
            .where('id', '=', project)
            .returningAll()
            .executeTakeFirstOrThrow()
            .then(formatProject);
    }

    async _purge(): Promise<void> {
        // deletes should cascade to other tables
        await this.db.deleteFrom('project').execute();
        await this.db.deleteFrom('employee').execute();
    }
}

function formatProject(project: Selectable<DBProject>): Project {
    return {
        ...project,
        createdDate: project.createdDate.toISOString(),
        finishedDate: project.finishedDate?.toISOString(),
    };
}

function formatTask(task: Selectable<DBTask>): Task {
    return { ...task, assignee: task.assignee || undefined };
}
