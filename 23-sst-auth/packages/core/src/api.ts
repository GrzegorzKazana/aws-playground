import { ApiHandler } from 'sst/node/api';
import { useSession } from 'sst/node/auth';

export const handler = ApiHandler(async (event, context) => {
    const session = useSession();

    if (session.type === 'public')
        return { statusCode: 200, body: JSON.stringify({ message: 'Hello, unknown user' }) };

    return {
        statusCode: 200,
        body: JSON.stringify({ message: `Hello, ${session.properties.name}` }),
    };
});
