const Cloudwatch = require('aws-sdk/clients/cloudwatch');
const { strict: assert } = require('assert');

const { AWS_REGION, CUSTOM_METRIC_NAME, CUSTOM_METRIC_NAMESPACE } = process.env;

assert(AWS_REGION);
assert(CUSTOM_METRIC_NAME);
assert(CUSTOM_METRIC_NAMESPACE);

const cloudwatch = new Cloudwatch({ region: AWS_REGION });

/** @param {{forceError?: boolean; value?: number}} event */
exports.handler = async (event, _context) => {
    if (event.forceError) throw new Error('Forcefully failed...');

    const customMetricValue = event.value || 50;

    return cloudwatch
        .putMetricData({
            Namespace: CUSTOM_METRIC_NAMESPACE,
            MetricData: [
                { MetricName: CUSTOM_METRIC_NAME, Timestamp: new Date(), Value: customMetricValue },
            ],
        })
        .promise();
};
