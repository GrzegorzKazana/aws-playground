import isOdd from 'is-odd';
import { toNum } from './toNum';

import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';

export const handler: APIGatewayProxyHandlerV2 = async (event, _context) => {
    const parameters = Object.values(event.queryStringParameters || {});
    const path = event.rawPath.split('/');

    const { number } = path.map(toNum).find(Boolean) ||
        parameters.map(toNum).find(Boolean) || { number: 42 };
    const isNumberOdd = isOdd(number);
    const body = isNumberOdd
        ? `Yes, ${number} is an odd number`
        : `No, ${number} is an even number`;

    return {
        statusCode: 200,
        headers: { 'content-type': 'text/plain' },
        body,
    };
};
