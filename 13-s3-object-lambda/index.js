const S3 = require('aws-sdk/clients/s3');
const sharp = require('sharp');

const { AWS_REGION, BUCKET_NAME } = process.env;

const s3 = new S3({ region: AWS_REGION });

/**
 * https://docs.aws.amazon.com/AmazonS3/latest/userguide/olap-writing-lambda.html
 * https://github.com/aws-samples/amazon-s3-object-lambda-default-configuration
 */
exports.handler = async (event, _context) => {
    const { userRequest: _, getObjectContext } = event;
    const { outputRoute, outputToken, inputS3Url } = getObjectContext;
    const inputS3Key = new URL(inputS3Url).pathname.slice(1); // drops the leading slash, e.g. '/image.png'
    const resizeConfig = extractResizeConfig(inputS3Key);
    const key = resizeConfig ? resizeConfig.key : inputS3Key;

    const { Body: buffer } = await s3
        .getObject({
            Bucket: BUCKET_NAME,
            Key: key,
        })
        .promise();

    const data = resizeConfig ? await sharp(buffer).resize(resizeConfig).toBuffer() : buffer;

    await s3
        .writeGetObjectResponse({
            RequestRoute: outputRoute,
            RequestToken: outputToken,
            Body: data,
        })
        .promise();

    return { statusCode: 200 };
};

/**
 * detects image sizing by name in format `name_${width}x${height}.png`
 */
function extractResizeConfig(name) {
    const suffix = name.match(/^(\w+)_(\d+)x(\d+)(\.\w+)$/);
    if (!suffix) return null;

    const [_, prefix, widthRaw, heightRaw, postfix] = suffix;
    const width = Number.parseInt(widthRaw, 10);
    const height = Number.parseInt(heightRaw, 10);
    const key = `${prefix}${postfix}`;

    return Number.isNaN(width) || Number.isNaN(height) ? null : { key, width, height };
}
