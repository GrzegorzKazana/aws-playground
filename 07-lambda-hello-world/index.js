// REST Api (v1), proxy lambda integration (default)
//
// event is whole http request https://docs.aws.amazon.com/apigateway/latest/developerguide/set-up-lambda-proxy-integrations.html#api-gateway-simple-proxy-for-lambda-input-format
// returned body must be stringified https://docs.aws.amazon.com/apigateway/latest/developerguide/set-up-lambda-proxy-integrations.html#api-gateway-simple-proxy-for-lambda-output-format
module.exports.restProxy = async (event, _ctx) => {
    const { name } = event.queryStringParameters || {};

    return { statusCode: 200, body: JSON.stringify({ msg: `Hello ${name}` }) };
};

// REST Api (v1), custom lambda integration
//
// event and response are controlled by requestTemplates and responseTemplates
// event content is constructed from query/params/body, which can be validated
// against openapi and json schema
module.exports.restCustom = async (event, _ctx) => {
    return { msg: `Hello ${event.name}` };
};

// HTTP Api (v2), proxy lambda integration
//
// event is whole http request https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-develop-integrations-lambda.html#http-api-develop-integrations-lambda.proxy-format
// returned value may be body or specific response format https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-develop-integrations-lambda.html#http-api-develop-integrations-lambda.response
module.exports.httpProxy = async (event, _ctx) => {
    const { name } = event.queryStringParameters || {};

    // will be interpreted as
    // {
    //     "isBase64Encoded": false,
    //     "statusCode": 200,
    //     "headers": { "content-type": "application/json" },
    //     "body": "{ \"msg\": \"Hello <name>\" }"
    // }
    return { msg: `Hello ${name}` };
};
