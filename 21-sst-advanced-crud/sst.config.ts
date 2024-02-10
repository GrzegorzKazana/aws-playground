import { SSTConfig } from 'sst';
import { API } from './stacks/TaskStack';
import { TestStack } from './stacks/TestStack';

export default {
    config(input) {
        return {
            name: '21-sst-recipes',
            region: 'eu-central-1',
            outputs: input.stage ? `outputs-${input.stage}.json` : 'outputs.json',
        };
    },
    stacks(app) {
        app.stack(API);

        if (app.stage === 'dev') {
            app.stack(TestStack);
        }
    },
} satisfies SSTConfig;
