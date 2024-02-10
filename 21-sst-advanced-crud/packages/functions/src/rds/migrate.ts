import { Kysely, PostgresDialect, Migrator, Migration } from 'kysely';
import { Pool } from 'pg';
import RDS from 'aws-sdk/clients/rds';
import assert from 'assert/strict';
import { readFileSync } from 'fs';
import { resolve } from 'path';

import { Migration_20240204T071737_CreateTables } from './migrations/20240204T071737_CreateTables';
import { Migration_20240206T061737_AddMissingForeignConstrains } from './migrations/20240206T061737_AddMissingForeignConstrains';

const { PGHOST, APP_USERNAME, AWS_REGION, APP_DB_NAME } = process.env;

const migrations: Record<string, Migration> = {
    [Migration_20240204T071737_CreateTables.name]: Migration_20240204T071737_CreateTables,
    [Migration_20240206T061737_AddMissingForeignConstrains.name]:
        Migration_20240206T061737_AddMissingForeignConstrains,
};

export async function handler() {
    assert(PGHOST, 'Missing PGHOST env value');
    assert(APP_USERNAME, 'Missing APP_USERNAME env value');
    assert(APP_DB_NAME, 'Missing APP_DB_NAME env value');
    assert(AWS_REGION, 'Missing AWS_REGION env value');

    const signer = new RDS.Signer({
        hostname: PGHOST,
        username: APP_USERNAME,
        port: 5432,
        region: AWS_REGION,
    });
    const token = signer.getAuthToken({ username: APP_USERNAME });

    const pool = new Pool({
        database: APP_DB_NAME,
        host: PGHOST,
        user: APP_USERNAME,
        password: token,
        ssl: {
            ca: readFileSync(resolve(__dirname, './cert/eu-central-1-bundle.pem')).toString(),
        },
    });
    const db = new Kysely({
        dialect: new PostgresDialect({ pool }),
    });

    const migrator = new Migrator({
        db,
        provider: {
            getMigrations() {
                return Promise.resolve(migrations);
            },
        },
    });

    const { error, results } = await migrator.migrateToLatest();

    (results || []).forEach(it => {
        if (it.status === 'Success') {
            console.log(`migration "${it.migrationName}" was executed successfully`);
        } else if (it.status === 'Error') {
            console.error(`failed to execute migration "${it.migrationName}"`);
        }
    });

    if (error) {
        console.error('failed to run `migrateToLatest`');
        console.error(error);

        throw error;
    }
}
