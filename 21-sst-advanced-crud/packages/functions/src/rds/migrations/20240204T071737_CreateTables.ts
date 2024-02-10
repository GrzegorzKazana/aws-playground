import { Kysely, sql } from 'kysely';

export const Migration_20240204T071737_CreateTables = {
    name: '20240204T071737_CreateTables',
    async up(db: Kysely<unknown>) {
        await db.schema
            .createTable('employee')
            .addColumn('id', 'text', c => c.primaryKey().defaultTo(sql`uuid_generate_v4()`))
            .addColumn('firstName', 'text', c => c.notNull())
            .addColumn('lastName', 'text', c => c.notNull())
            .execute();

        await db.schema
            .createTable('project')
            .addColumn('id', 'text', c => c.primaryKey().defaultTo(sql`uuid_generate_v4()`))
            .addColumn('name', 'text', c => c.notNull())
            .addColumn('createdDate', 'timestamptz', c => c.notNull())
            .addColumn('finishedDate', 'timestamptz')
            .execute();

        await db.schema
            .createTable('project_member')
            .addColumn('employee', 'text', c => c.notNull())
            .addColumn('project', 'text', c => c.notNull())
            .addColumn('role', 'text', c =>
                c.notNull().check(sql`role IN ('manager', 'developer', 'tester')`),
            )
            .addPrimaryKeyConstraint('project_member_pk', ['employee', 'project'])
            .execute();

        await db.schema
            .createTable('task')
            .addColumn('id', 'text', c => c.primaryKey().defaultTo(sql`uuid_generate_v4()`))
            .addColumn('project', 'text', c =>
                c.notNull().references('project.id').onDelete('cascade'),
            )
            .addColumn('title', 'text', c => c.notNull())
            .addColumn('description', 'text', c => c.notNull())
            .addColumn('status', 'text', c =>
                c.notNull().check(sql`status IN ('todo', 'in_progress', 'qa', 'done')`),
            )
            .addColumn('assignee', 'text', c => c.references('employee.id').onDelete('set null'))
            .execute();
    },
    async down(db: Kysely<unknown>) {
        await db.schema.dropTable('task').execute();
        await db.schema.dropTable('project_member').execute();
        await db.schema.dropTable('project').execute();
        await db.schema.dropTable('employee').execute();
    },
};
