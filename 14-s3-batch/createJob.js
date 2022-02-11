const { strict: assert } = require('assert');
const S3 = require('aws-sdk/clients/s3');
const S3Control = require('aws-sdk/clients/s3control');

const {
    AWS_REGION,
    ACCOUNT_ID,
    JOB_ROLE_ARN,
    PROCESSING_FUNCTION_ARN,
    INPUT_BUCKET,
    INPUT_BUCKET_ARN,
    MANIFEST_BUCKET,
    MANIFEST_BUCKET_ARN,
    REPORTS_BUCKET_ARN,
} = process.env;

assert(AWS_REGION, 'You must provide "AWS_REGION" env variable');
assert(ACCOUNT_ID, 'You must provide "ACCOUNT_ID" env variable');
assert(JOB_ROLE_ARN, 'You must provide "JOB_ROLE_ARN" env variable');
assert(PROCESSING_FUNCTION_ARN, 'You must provide "PROCESSING_FUNCTION_ARN" env variable');
assert(INPUT_BUCKET, 'You must provide "INPUT_BUCKET" env variable');
assert(INPUT_BUCKET_ARN, 'You must provide "INPUT_BUCKET_ARN" env variable');
assert(MANIFEST_BUCKET, 'You must provide "MANIFEST_BUCKET" env variable');
assert(MANIFEST_BUCKET_ARN, 'You must provide "MANIFEST_BUCKET_ARN" env variable');
assert(REPORTS_BUCKET_ARN, 'You must provide "REPORTS_BUCKET_ARN" env variable');

const s3 = new S3({ region: AWS_REGION });
const s3Control = new S3Control({ region: AWS_REGION });

/** @type {import('aws-lambda').Handler} */
exports.handler = async (_event, ctx) => {
    // yeah, I know, if bucket contains more than 1000 objects
    // I would have to use `NextMarker` to get the full list
    // (or could have generate inventory reports)
    const { Contents } = await s3.listObjects({ Bucket: INPUT_BUCKET }).promise();

    if (!Contents || Contents.length === 0) return { JobId: null };

    const manifestKey = `manifest-${ctx.awsRequestId}.csv`;
    const manifestCsv = Contents.map(({ Key }) => (Key ? `${INPUT_BUCKET},${Key}` : ''))
        .filter(Boolean)
        .join('\n');

    const { ETag: ManifestETag } = await s3
        .putObject({
            Bucket: MANIFEST_BUCKET,
            Key: manifestKey,
            Body: Buffer.from(manifestCsv),
            ContentType: 'text/plain',
        })
        .promise();

    if (!ManifestETag) throw new Error('Failed to create manifest file');

    const { JobId } = await s3Control
        .createJob({
            AccountId: ACCOUNT_ID,
            Operation: { LambdaInvoke: { FunctionArn: PROCESSING_FUNCTION_ARN } },
            Report: {
                Enabled: true,
                Bucket: REPORTS_BUCKET_ARN,
                Format: 'Report_CSV_20180820',
                ReportScope: 'AllTasks',
            },
            ConfirmationRequired: false,
            ClientRequestToken: ctx.awsRequestId,
            Priority: 42,
            RoleArn: JOB_ROLE_ARN,
            Manifest: {
                Spec: {
                    Format: 'S3BatchOperations_CSV_20180820',
                    Fields: ['Bucket', 'Key'],
                },
                Location: {
                    ObjectArn: `${MANIFEST_BUCKET_ARN}/${manifestKey}`,
                    ETag: ManifestETag,
                },
            },
        })
        .promise();

    return { JobId };
};
