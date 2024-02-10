export type ProjectId = string;
export type TaskId = string;
export type EmployeeId = string;

export type Project = {
    id: ProjectId;
    name: string;
    createdDate: string;
    finishedDate?: string | undefined;
};
export type Task = {
    project: ProjectId;
    status: 'todo' | 'in_progress' | 'qa' | 'done';
    id: TaskId;
    title: string;
    description: string;
    assignee?: EmployeeId | undefined;
};
export type Employee = {
    id: EmployeeId;
    firstName: string;
    lastName: string;
};
export type ProjectMember = {
    project: ProjectId;
    employee: EmployeeId;
    role: 'manager' | 'developer' | 'tester';
};

export interface TaskRepository {
    createProject(project: Omit<Project, 'id'>): Promise<Project>;
    createTask(task: Omit<Task, 'id'>): Promise<Task>;
    createEmployee(employee: Omit<Employee, 'id'>): Promise<Employee>;
    assignEmployeeToProject(member: Omit<ProjectMember, 'id'>): Promise<ProjectMember>;
    unassignEmployeeFromProject(
        member: Pick<ProjectMember, 'employee' | 'project'>,
    ): Promise<Partial<ProjectMember>>;
    changeTaskStatus(
        project: ProjectId,
        task: TaskId,
        status: Task['status'],
    ): Promise<Partial<Task>>;
    assignTaskToEmployee(
        project: ProjectId,
        task: TaskId,
        employee: EmployeeId,
    ): Promise<Partial<Task>>;
    finishProject(project: ProjectId, finishedDate: string): Promise<Partial<Project>>;
    getProjectDetails(project: ProjectId): Promise<Project | null>;
    getAllProjects(): Promise<Project[]>;
    getFinishedProjects(): Promise<Project[]>;
    getProjectsInProgress(): Promise<Project[]>;
    getProjectsCreatedAfter(time: Date): Promise<Project[]>;
    getProjectsByEmployee(employee: EmployeeId): Promise<Project[]>;
    getAllTasks(project: ProjectId): Promise<Task[]>;
    getTasks(
        project: ProjectId,
        { status, assignee }: Partial<{ status: Task['status']; assignee: EmployeeId }>,
    ): Promise<Task[]>;
    getTaskDetails(project: ProjectId, task: TaskId): Promise<Task | null>;
    getAllEmployees(): Promise<Employee[]>;
    getEmployees({
        project,
        role,
    }: {
        project: ProjectId;
        role?: ProjectMember['role'];
    }): Promise<Employee[]>;
    getEmployeeDetails(employee: EmployeeId): Promise<Employee | null>;
    deleteEmployee(employee: EmployeeId): Promise<Partial<Employee>>;
    deleteEmployees(employees: EmployeeId[]): Promise<unknown>;
    deleteProject(project: ProjectId): Promise<Partial<Project>>;
    _purge(): Promise<void>;
}
