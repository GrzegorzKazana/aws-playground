import { useSession } from 'sst/node/auth';
import { APIGatewayRequestSimpleAuthorizerHandlerV2 } from 'aws-lambda';
import { Handler } from 'sst/context';

export const handler: APIGatewayRequestSimpleAuthorizerHandlerV2 = Handler(
    'api',
    async (event, context) => {
        const session = useSession();

        return { isAuthorized: session.type === 'user' };
    },
);
