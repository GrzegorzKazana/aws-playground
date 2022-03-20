const { strict: assert } = require('assert');
const StepFunctions = require('aws-sdk/clients/stepfunctions');

const { AWS_REGION, STATE_MACHINE_ARN } = process.env;

assert(AWS_REGION);
assert(STATE_MACHINE_ARN);

const stepFunctions = new StepFunctions({ region: AWS_REGION });

/**
 * @typedef {{a: number}} ExecutionParams
 */

/**
 * @param {import('aws-lambda').S3Event} event
 * @param {import('aws-lambda').Context} context
 * @returns {Promise<void>}
 */
exports.handler = async (event, context) => {
    const _results = await Promise.all(
        event.Records.map(({ s3 }) =>
            stepFunctions
                .startExecution({
                    stateMachineArn: STATE_MACHINE_ARN,
                    input: JSON.stringify({ key: s3.object.key }),
                })
                .promise()
                .then(({ startDate, executionArn }) => ({ startDate, executionArn })),
        ),
    );
};
