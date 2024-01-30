import { SSTConfig } from 'sst';
import { API } from './stacks/TaskStack';
import { TestStack } from './stacks/TestStack';

export default {
    config(_input) {
        return {
            name: '21-sst-recipes',
            region: 'eu-central-1',
        };
    },
    stacks(app) {
        if (app.stage === 'dev') {
            app.stack(TestStack);
        }

        app.stack(API);
    },
} satisfies SSTConfig;
