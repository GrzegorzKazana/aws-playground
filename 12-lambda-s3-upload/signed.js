// https://aws.amazon.com/blogs/compute/uploading-to-amazon-s3-directly-from-a-web-or-mobile-application/
const S3Client = require('aws-sdk/clients/s3');

const { AWS_REGION, BUCKET_NAME } = process.env;

const s3 = new S3Client({ region: AWS_REGION });

/**
 * @type {import('aws-lambda').ProxyHandler}
 */
exports.handler = async (event, _context) => {
    const { key } = event.pathParameters || {};

    const signed = s3.createPresignedPost({
        Bucket: BUCKET_NAME,
        Fields: { key },
        // https://docs.aws.amazon.com/AmazonS3/latest/API/sigv4-HTTPPOSTConstructPolicy.html
        Conditions: [['content-length-range', 0, 1024 * 1024]],
    });

    return { statusCode: 200, body: JSON.stringify(signed) };
};
