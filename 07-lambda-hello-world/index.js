// REST Api (v1), proxy lambda integration (default)
//
// event is whole http request https://docs.aws.amazon.com/apigateway/latest/developerguide/set-up-lambda-proxy-integrations.html#api-gateway-simple-proxy-for-lambda-input-format
// returned body must be stringified https://docs.aws.amazon.com/apigateway/latest/developerguide/set-up-lambda-proxy-integrations.html#api-gateway-simple-proxy-for-lambda-output-format
module.exports.restProxy = async (event, _ctx) => {
    const { name } = event.queryStringParameters || {};

    return { statusCode: 200, body: JSON.stringify({ msg: `Hello ${name}` }) };
};
