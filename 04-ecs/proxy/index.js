const http = require('http');
const url = require('url');
const fetch = require('node-fetch');

const PROXY_PORT = Number.parseInt(process.env.PROXY_PORT, 10) || 9090;
const APP_PORT = Number.parseInt(process.env.APP_PORT, 10) || 9090;
const APP_HOST = process.env.APP_HOST || '';

const cacheKey = 'key';
const cache = new Map();

const server = http.createServer((req, res) => {
    const { query } = url.parse(req.url, true);
    const useCache = !!query.cache;
    const cached = cache.get(cacheKey);

    if (useCache && cached) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(cached);
        return;
    }

    fetch(`http://${APP_HOST}:${APP_PORT}`)
        .then(r => r.json())
        .then(data => {
            const response = JSON.stringify({ data, url: req.url });
            cache.set(cacheKey, response);

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(response);
        });
});

server.listen(PROXY_PORT, () =>
    console.log(
        `Proxy running on port ${PROXY_PORT}, and making requests to ${`${APP_HOST}:${APP_PORT}`}`,
    ),
);
