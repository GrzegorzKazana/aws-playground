import { SSTConfig } from 'sst';
import { API } from './stacks/MyStack';

export default {
    config(input) {
        return {
            name: '22-sst-upcycle',
            region: 'eu-central-1',
            outputs: input.stage ? `outputs-${input.stage}.json` : 'outputs.json',
        };
    },
    stacks(app) {
        app.stack(API);
    },
} satisfies SSTConfig;
