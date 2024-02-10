import { StackContext, Table, Script, Config, use } from 'sst/constructs';

import { API } from './TaskStack';

/** Resources used during testing */
export function TestStack({ stack }: StackContext) {
    const { rdsParameters, rds, rdsMasterSecret } = use(API);

    const table = new Table(stack, 'test-todo-table', {
        primaryIndex: {
            partitionKey: 'pk',
            sortKey: 'sk',
        },
        fields: {
            pk: 'string',
            sk: 'string',
            lsi1sk: 'string',
            gsi1pk: 'string',
            gsi1sk: 'string',
        },
        localIndexes: {
            lsi1: { sortKey: 'lsi1sk' },
        },
        globalIndexes: {
            gsi1: {
                partitionKey: 'gsi1pk',
                sortKey: 'gsi1sk',
            },
        },
    });

    const rdsTestParameters = Config.Parameter.create(stack, {
        APP_TEST_DB_NAME: 'test_task_db',
    });

    const rdsInitializerScript = new Script(stack, 'rds-test-init', {
        onCreate: {
            handler: 'packages/functions/src/rds/init.handler',
            copyFiles: [{ from: 'packages/functions/src/rds/cert/eu-central-1-bundle.pem' }],
            environment: {
                DB_CREDS_SECRETNAME: rdsMasterSecret.secretName,
                PGHOST: rdsParameters.PGHOST.value,
                APP_USERNAME: rdsParameters.APP_USERNAME.value,
                APP_DB_NAME: rdsTestParameters.APP_TEST_DB_NAME.value,
            },
        },
    });

    rdsMasterSecret.grantRead(rdsInitializerScript.createFunction!);
    rdsInitializerScript.node.addDependency(rds, rdsMasterSecret);

    const rdsMigrationScript = new Script(stack, 'rds-test-migrate', {
        version: '1.4',
        onUpdate: {
            handler: 'packages/functions/src/rds/migrate.handler',
            copyFiles: [{ from: 'packages/functions/src/rds/cert/eu-central-1-bundle.pem' }],
            environment: {
                PGHOST: rdsParameters.PGHOST.value,
                APP_USERNAME: rdsParameters.APP_USERNAME.value,
                APP_DB_NAME: rdsTestParameters.APP_TEST_DB_NAME.value,
            },
        },
    });

    rds.grantConnect(rdsMigrationScript.updateFunction!, rdsParameters.APP_USERNAME.value);
}
