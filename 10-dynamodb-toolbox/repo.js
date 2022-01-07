const { randomUUID } = require('crypto');
const { Entity, Table } = require('dynamodb-toolbox');

/**
 * @param {import('aws-sdk/clients/dynamodb').DocumentClient} client
 */
function buildEntities(client) {
    const table = new Table({
        DocumentClient: client,
        name: 'task10-dynamo',
        partitionKey: 'PK',
        sortKey: 'SK',
        indexes: {
            LSI1: { sortKey: 'LSI1SK' },
        },
    });

    const Organization = new Entity({
        table,
        name: 'organization',
        attributes: {
            PK: { partitionKey: true, default: ({ id }) => `org#${id}` },
            SK: { sortKey: true, default: ({ field }) => field },

            id: { type: 'string' },
            field: { type: 'string' },
            name: { type: 'string' },
        },
    });

    const Project = new Entity({
        table,
        name: 'project',
        attributes: {
            PK: { partitionKey: true, default: ({ org }) => `org#${org}` },
            SK: { sortKey: true, default: ({ id }) => `proj#${id}` },

            id: { type: 'string' },
            org: { type: 'string' },
            name: { type: 'string' },
        },
    });

    const Task = new Entity({
        table,
        name: 'task',
        attributes: {
            PK: { partitionKey: true, default: ({ org, project }) => `org#${org}#proj#${project}` },
            SK: { sortKey: true, default: ({ id }) => `task#${id}` },
            LSI1SK: { onUpdate: true, default: ({ status }) => `status#${status}` },

            id: { type: 'string' },
            org: { type: 'string' },
            project: { type: 'string' },
            name: { type: 'string' },
            status: { type: 'string' },
            assignee: { type: 'string', prefix: 'user#' },
        },
    });

    const Comment = new Entity({
        table,
        name: 'comment',
        attributes: {
            PK: {
                partitionKey: true,
                default: ({ org, project, task }) => `org#${org}#proj#${project}#task#${task}`,
            },
            SK: { sortKey: true, default: ({ id }) => `comment#${id}` },

            id: { type: 'string' },
            org: { type: 'string' },
            project: { type: 'string' },
            task: { type: 'string' },
            author: { type: 'string', prefix: 'user#' },
            text: 'string',
        },
    });

    const OrganizationUser = new Entity({
        table,
        name: 'organization-user',
        attributes: {
            PK: { partitionKey: true, default: ({ org }) => `org#${org}` },
            SK: { sortKey: true, default: ({ id }) => `user#${id}` },

            id: { type: 'string' },
            org: { type: 'string' },
            name: { type: 'string' },
        },
    });

    const ProjectUser = new Entity({
        table,
        name: 'project-user',
        attributes: {
            PK: { partitionKey: true, default: ({ org, project }) => `org#${org}#proj#${project}` },
            SK: { sortKey: true, default: ({ id }) => `user#${id}` },
            LSI1SK: { onUpdate: true, default: ({ role }) => `role#${role}` },

            id: { type: 'string' },
            org: { type: 'string' },
            project: { type: 'string' },
            role: { type: 'string' },
        },
    });

    return {
        table,
        Organization,
        Project,
        Task,
        Comment,
        OrganizationUser,
        ProjectUser,
    };
}

class Repository {
    /**
     * @param {import('aws-sdk/clients/dynamodb').DocumentClient} client
     */
    constructor(client) {
        this.client = client;
        const { table, Organization, Project, Task, Comment, OrganizationUser, ProjectUser } =
            buildEntities(client);

        this.table = table;
        this.Organization = Organization;
        this.Project = Project;
        this.Task = Task;
        this.Comment = Comment;
        this.OrganizationUser = OrganizationUser;
        this.ProjectUser = ProjectUser;
    }

    createOrganization(name) {
        const params = {
            id: randomUUID(),
            field: 'METADATA',
            name,
        };

        return this.Organization.put(params).then(res => ({ ...res, params }));
    }

    createUser(organization, name) {
        const params = {
            id: randomUUID(),
            org: organization,
            name,
        };

        return this.OrganizationUser.put(params).then(res => ({ ...res, params }));
    }

    createProject(organization, name, admin) {
        const projectId = randomUUID();
        const params = {
            project: {
                id: projectId,
                org: organization,
                name,
            },
            user: {
                id: admin,
                org: organization,
                project: projectId,
                role: 'ADMIN',
            },
        };

        return this.table
            .transactWrite([
                this.Project.putTransaction(params.project),
                this.ProjectUser.putTransaction(params.user),
            ])
            .then(res => ({ ...res, params }));
    }

    assignUserToProject(organization, project, user, role) {
        const params = {
            id: user,
            org: organization,
            project,
            role,
        };

        return this.ProjectUser.put(params).then(res => ({ ...res, params }));
    }

    createTask(organization, project, name, assignee) {
        const params = {
            id: randomUUID(),
            org: organization,
            project,
            name,
            status: 'TODO',
            assignee,
        };

        return this.Task.put(params).then(res => ({ ...res, params }));
    }

    transitionTaskToStatus(organization, project, task, status) {
        // Record<NextStatus, CurrentStatus>
        const allowedStatusTransitions = {
            TODO: 'TODO',
            IN_PROGRESS: 'TODO',
            DONE: 'IN_PROGRESS',
        };

        return this.Task.update(
            {
                id: task,
                org: organization,
                project,
                status,
            },
            { conditions: { attr: 'status', eq: allowedStatusTransitions[status] } },
        );
    }

    createComment(organization, project, task, author, text) {
        const params = {
            id: randomUUID(),
            org: organization,
            project,
            task,
            author,
            text,
        };

        return this.Comment.put(params).then(res => ({ ...res, params }));
    }

    getOrganizationDetail(organization) {
        return this.Organization.get({
            id: organization,
            field: 'METADATA',
        });
    }

    listUsersInOrganization(organization) {
        return this.OrganizationUser.query(`org#${organization}`, { beginsWith: 'user#' });
    }

    listProjectsInOrganization(organization) {
        return this.Project.query(`org#${organization}`, { beginsWith: 'proj#' });
    }

    getProjectDetail(organization, project) {
        return this.Project.get(`org#${organization}`, { eq: `proj#${project}` });
    }

    listUsersInProject(organization, project) {
        return this.ProjectUser.query(`org#${organization}#proj#${project}`, {
            beginsWith: 'user#',
        });
    }

    listProjectUsersByRole(organization, project, role) {
        return this.ProjectUser.query(`org#${organization}#proj#${project}`, {
            index: 'LSI1',
            eq: `role#${role}`,
        });
    }

    getUserRoleInProject(organization, project, user) {
        return this.ProjectUser.get({
            id: user,
            org: organization,
            project,
        });
    }

    listTasks(organization, project) {
        return this.Task.query(`org#${organization}#proj#${project}`, { beginsWith: 'task#' });
    }

    listTasksByStatus(organization, project, status) {
        return this.Task.query(`org#${organization}#proj#${project}`, {
            index: 'LSI1',
            eq: `status#${status}`,
        });
    }

    listTasksByUser(organization, project, user) {
        return this.Task.query(`org#${organization}#proj#${project}`, {
            beginsWith: 'task#',
            filters: { attr: 'assignee', eq: `user#${user}` },
        });
    }

    getTask(organization, project, task) {
        return this.Task.get({
            id: task,
            org: organization,
            project,
        });
    }

    getTaskComments(organization, project, task) {
        return this.Comment.query(`org#${organization}#proj#${project}#task#${task}`, {
            beginsWith: 'comment#',
        });
    }
}

module.exports = Repository;
