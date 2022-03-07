/**
 * @param {string} item
 * @returns {unknown}
 */
function tryParseJson(item) {
    try {
        return JSON.parse(item);
    } catch {
        return {};
    }
}

/**
 * @param {unknown} a
 * @returns {a is Record<string, unknown>}
 */
function isObject(a) {
    return a !== null && typeof a === 'object';
}

/**
 * @param {unknown} a
 * @returns {a is string}
 */
function isString(a) {
    return typeof a === 'string';
}

/**
 * @template T
 * @param {T[]} a
 * @param {(a: T) => string} cb
 * @returns {Record<string, T[]>}
 */
function groupBy(a, cb) {
    return a.reduce((acc, item) => {
        const key = cb(item);

        if (!acc[key]) acc[key] = [];
        acc[key].push(item);

        return acc;
    }, {});
}

/**
 * @param {Array<() => Promise<unknown>>} createPromises
 * @returns {Promise<unknown>}
 */
function promiseSerial(createPromises) {
    /** @type {Promise<unknown>} */
    const init = Promise.resolve();

    return createPromises.reduce((acc, createPromise) => acc.then(createPromise), init);
}

/**
 * @param {string} prefix
 * @returns {(err: unknown) => Promise<never>}
 */
function prefixError(prefix) {
    return err => {
        const msg = err instanceof Error ? err.message : '';
        const error = new Error(`${prefix}: (${msg})`);

        return Promise.reject(error);
    };
}

/**
 * @param {import('aws-sdk').ApiGatewayManagementApi} api
 * @param {import('./repo.js')} repo
 * @param {string} connectionId
 * @param {import('aws-sdk').ApiGatewayManagementApi.Data} data
 */
function postToConnectionWithCleanup(api, repo, connectionId, data) {
    return api
        .postToConnection({ ConnectionId: connectionId, Data: JSON.stringify(data) })
        .promise()
        .catch(err =>
            // 410 means the client has already disconnected
            err.statusCode === 410
                ? repo
                      .disconnect(connectionId)
                      .then(() => Promise.resolve({ statusCode: 200, body: 'Connection gone' }))
                      .catch(prefixError('Failed to clean up connection'))
                : prefixError('Failed to post to connection')(err),
        );
}

module.exports = {
    tryParseJson,
    isObject,
    isString,
    groupBy,
    promiseSerial,
    prefixError,
    postToConnectionWithCleanup,
};
