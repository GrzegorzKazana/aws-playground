import { Request, Response, NextFunction, HandlerFunction } from 'lambda-api';
import { z, ZodSchema } from 'zod';

export function isNotFalsy<T>(a: T | false | null | undefined | '' | 0): a is T {
    return !!a;
}

export function isNotNullable<T>(a: T | null | undefined): a is T {
    return a !== undefined && a !== null;
}

export function partition<T, U extends T>(
    items: T[],
    pred: (item: T) => item is U,
): [U[], Exclude<T, U>[]] {
    return items.reduce(
        ([rights, lefts], item) => {
            if (pred(item)) rights.push(item);
            else lefts.push(item as Exclude<T, U>);

            return [rights, lefts];
        },
        [[], []] as [U[], Exclude<T, U>[]],
    );
}

export function partitionPromiseSettled<T>(result: Array<PromiseSettledResult<T>>): {
    fulfilled: T[];
    rejected: unknown[];
} {
    const [fulfilled, rejected] = partition(
        result,
        (item): item is PromiseFulfilledResult<T> => item.status === 'fulfilled',
    );

    return {
        fulfilled: fulfilled.map(({ value }) => value),
        rejected: rejected.map(({ reason }) => reason),
    };
}

export function validatedRoute<
    Body extends ZodSchema = ZodSchema<any>,
    Query extends ZodSchema = ZodSchema<Record<string, string | undefined>>,
    Params extends ZodSchema = ZodSchema<Record<string, string | undefined>>,
>(
    schemas: {
        query?: Query;
        body?: Body;
        params?: Params;
    },
    handler: (
        req: {
            [K in keyof Request]: K extends 'body'
                ? z.infer<Body>
                : K extends 'query'
                ? z.infer<Query>
                : K extends 'params'
                ? z.infer<Params>
                : Request[K];
        },
        res: Response,
        next?: NextFunction,
    ) => void,
): HandlerFunction {
    return (req, res, next) => {
        const validBody = (schemas.body || z.any()).safeParse(req.body);
        const validQuery = (schemas.query || z.any()).safeParse(req.query);
        const validParams = (schemas.params || z.any()).safeParse(req.params);

        if (!validBody.success || !validQuery.success || !validParams.success)
            return res.status(400).send({
                message: 'Invalid input data',
                errors: [
                    !validBody.success && validBody.error.message,
                    !validQuery.success && validQuery.error.message,
                    !validParams.success && validParams.error.message,
                ].filter(Boolean),
            });

        Object.assign(req, {
            body: validBody.data,
            query: validQuery.data,
            params: validParams.data,
        });

        return handler(req, res, next);
    };
}

export function orNotFound<T>(res: Response) {
    return (data: T | null) => {
        return data ? res.send(data) : res.status(404).send({ message: 'Not found' });
    };
}
