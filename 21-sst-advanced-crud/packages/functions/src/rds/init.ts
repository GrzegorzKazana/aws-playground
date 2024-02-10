import { Kysely, PostgresDialect, sql } from 'kysely';
import { Pool } from 'pg';
import SecretsManager from 'aws-sdk/clients/secretsmanager';
import assert from 'assert/strict';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const { PGHOST, DB_CREDS_SECRETNAME, LAMBDA_TASK_ROOT, APP_USERNAME, APP_DB_NAME } = process.env;

export async function handler() {
    assert(PGHOST, 'Missing PGHOST env value');
    assert(DB_CREDS_SECRETNAME, 'Missing DB_CREDS_SECRETNAME env value');
    assert(LAMBDA_TASK_ROOT, 'Missing LAMBDA_TASK_ROOT env value');
    assert(APP_USERNAME, 'Missing APP_USERNAME env value');
    assert(APP_DB_NAME, 'Missing APP_DB_NAME env value');

    const sm = new SecretsManager();
    const materSecretValue = await sm.getSecretValue({ SecretId: DB_CREDS_SECRETNAME }).promise();

    assert(materSecretValue.SecretString, 'Missing DB_CREDS_SECRETNAME secret value');

    const { username: masterUsername, password: masterPassword } = JSON.parse(
        materSecretValue.SecretString,
    );

    const initPool = new Pool({
        database: 'postgres',
        host: PGHOST,
        user: masterUsername,
        password: masterPassword,
        ssl: {
            ca: readFileSync(resolve(__dirname, './cert/eu-central-1-bundle.pem')).toString(),
        },
    });

    const initDb = new Kysely({
        dialect: new PostgresDialect({ pool: initPool }),
    });

    const alreadyExistsQuery = sql`SELECT 1 FROM pg_database WHERE datname=${APP_DB_NAME};`;
    const alreadyExists = await alreadyExistsQuery.execute(initDb);

    if (alreadyExists.rows.length) {
        console.log(`Database ${APP_DB_NAME} already exists`);
        return;
    }

    const createDbQuery = sql`CREATE DATABASE ${sql.id(APP_DB_NAME)}`;

    await createDbQuery.execute(initDb);

    const pool = new Pool({
        database: APP_DB_NAME,
        host: PGHOST,
        user: masterUsername,
        password: masterPassword,
        ssl: {
            ca: readFileSync(resolve(__dirname, './cert/eu-central-1-bundle.pem')).toString(),
        },
    });

    const db = new Kysely({
        dialect: new PostgresDialect({ pool }),
    });

    const userAlreadyExistsQuery = sql`SELECT 1 FROM pg_roles WHERE rolname=${APP_USERNAME};`;
    const userAlreadyExists = await userAlreadyExistsQuery.execute(initDb);

    if (!userAlreadyExists.rows.length) {
        const createUserQuery = sql`
            CREATE USER ${sql.id(APP_USERNAME)};
            GRANT rds_iam TO ${sql.id(APP_USERNAME)};
        `;

        await createUserQuery.execute(db);
    }

    const grantPrivilegesUserQuery = sql`
        REVOKE CREATE ON SCHEMA public FROM PUBLIC;
        REVOKE ALL ON DATABASE ${sql.id(APP_DB_NAME)} FROM PUBLIC;

        GRANT ALL PRIVILEGES ON DATABASE ${sql.id(APP_DB_NAME)} TO ${sql.id(masterUsername)};
        GRANT ALL ON SCHEMA public TO ${sql.id(masterUsername)};

        GRANT CONNECT ON DATABASE ${sql.id(APP_DB_NAME)} TO ${sql.id(APP_USERNAME)};
        GRANT USAGE, CREATE ON SCHEMA public TO ${sql.id(APP_USERNAME)};
        GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${sql.id(
            APP_USERNAME,
        )};
        ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${sql.id(
            APP_USERNAME,
        )};
        GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO ${sql.id(APP_USERNAME)};
        ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE ON SEQUENCES TO ${sql.id(
            APP_USERNAME,
        )};
    `;

    await grantPrivilegesUserQuery.execute(db);

    const createExtensionQuery = sql`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`;

    await createExtensionQuery.execute(db);
}
