import { SSTConfig } from 'sst';
import { API } from './stacks/MyStack';

export default {
    config(input) {
        return {
            name: '23-sst-auth',
            region: 'us-east-1',
            outputs: input.stage ? `outputs-${input.stage}.json` : 'outputs.json',
        };
    },
    stacks(app) {
        app.stack(API);
    },
} satisfies SSTConfig;
