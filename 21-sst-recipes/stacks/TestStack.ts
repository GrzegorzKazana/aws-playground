import { StackContext, Api, EventBus, Function, Table } from 'sst/constructs';

/** Resources used during testing */
export function TestStack({ stack }: StackContext) {
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
}
