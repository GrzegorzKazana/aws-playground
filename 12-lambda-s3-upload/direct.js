const S3Client = require('aws-sdk/clients/s3');
const multipart = require('parse-multipart');

const { AWS_REGION, BUCKET_NAME } = process.env;

const s3 = new S3Client({ region: AWS_REGION });

/**
 * @type {import('aws-lambda').ProxyHandler}
 */
exports.handler = async (event, _context) => {
    const { key: Key } = event.pathParameters || {};

    const files = extractFiles(event);

    const requests = files
        .map(({ name, ...rest }) => ({ ...rest, key: `${Key}-${name}` }))
        .map(({ key, data }) =>
            s3
                .putObject({
                    Key: key,
                    Bucket: BUCKET_NAME,
                    Body: data,
                })
                .promise()
                .then(({ ETag }) => ({ ETag, key })),
        );

    const savedFiles = await Promise.all(requests);

    return { statusCode: 200, body: JSON.stringify({ files: savedFiles }) };
};

/**
 *
 * @param {import('aws-lambda').APIGatewayProxyEvent} event
 */
function extractFiles(event) {
    const contentType = event.headers['content-type'];
    const body = Buffer.from(event.body, 'base64');

    return contentType.startsWith('multipart/form-data')
        ? extractMultipart(contentType, body)
        : [{ name: 'image.png', data: body }];
}

function extractMultipart(contentType, body) {
    const boundary = contentType.split('boundary=')[1];
    const parts = multipart.Parse(body, boundary);

    return parts.map(({ filename, data }) => ({ name: filename, data }));
}
