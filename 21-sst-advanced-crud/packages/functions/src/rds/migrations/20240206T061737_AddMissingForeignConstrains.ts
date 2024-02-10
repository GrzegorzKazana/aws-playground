import { Kysely } from 'kysely';
import { DB } from '@21-sst-recipes/core/task-repository-rds';

export const Migration_20240206T061737_AddMissingForeignConstrains = {
    name: '20240206T061737_AddMissingForeignConstrains',
    async up(db: Kysely<DB>) {
        await db.schema
            .alterTable('project_member')
            .addForeignKeyConstraint('project_fk', ['project'], 'project', ['id'])
            .onDelete('cascade')
            .execute();
        await db.schema
            .alterTable('project_member')
            .addForeignKeyConstraint('employee_fk', ['employee'], 'employee', ['id'])
            .onDelete('cascade')
            .execute();
    },
    async down(db: Kysely<DB>) {
        await db.schema.alterTable('project_member').dropConstraint('project_fk').execute();
        await db.schema.alterTable('project_member').dropConstraint('employee_fk').execute();
    },
};
