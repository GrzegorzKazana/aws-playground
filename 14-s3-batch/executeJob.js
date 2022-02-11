const { strict: assert } = require('assert');
const S3 = require('aws-sdk/clients/s3');

const { AWS_REGION, OUTPUT_BUCKET } = assertEnv(process.env);

const s3 = new S3({ region: AWS_REGION });

/** @type {import('aws-lambda').S3BatchHandler} */
exports.handler = async (event, _ctx) => {
    const results = await Promise.all(event.tasks.map(processTask));

    return {
        invocationId: event.invocationId,
        invocationSchemaVersion: event.invocationSchemaVersion,
        treatMissingKeysAs: 'Succeeded',
        results,
    };
};

/**
 * @param {import('aws-lambda').S3BatchEventTask} task
 * @returns {Promise<import('aws-lambda').S3BatchResultResult>}
 */
async function processTask(task) {
    return processObject(bucketArnToName(task.s3BucketArn), task.s3Key)
        .then(
            () =>
                /** @type {const} */ ({
                    taskId: task.taskId,
                    resultCode: 'Succeeded',
                    resultString: `Processed ${task.s3Key} at ${task.s3BucketArn}`,
                }),
        )
        .catch(
            err =>
                /** @type {const} */ ({
                    taskId: task.taskId,
                    resultCode: 'PermanentFailure',
                    resultString: `Failed to process ${task.s3Key} at ${task.s3BucketArn} (${
                        err instanceof Error ? err.message : ''
                    })`,
                }),
        );
}

/**
 * @param {string} bucket
 * @param {string} key
 */
async function processObject(bucket, key) {
    const { Body, ContentType } = await s3.getObject({ Bucket: bucket, Key: key }).promise();

    if (!Body || !ContentType || !ContentType.startsWith('text'))
        throw new Error(`Cannot process non-text object "${key}" at "${bucket}"`);

    const content = Body.toString();
    const processedContent = content.toUpperCase();

    return s3
        .putObject({
            Bucket: OUTPUT_BUCKET,
            Key: key,
            Body: Buffer.from(processedContent),
            ContentType,
        })
        .promise();
}

/** @param {Record<string, string | undefined>} env */
function assertEnv(env) {
    const { AWS_REGION, OUTPUT_BUCKET } = env;

    assert(AWS_REGION, 'You must provide "AWS_REGION" env variable');
    assert(OUTPUT_BUCKET, 'You must provide "OUTPUT_BUCKET" env variable');

    return { AWS_REGION, OUTPUT_BUCKET };
}

function bucketArnToName(arn) {
    const chunks = arn.split(':');

    return chunks[chunks.length - 1];
}
