const http = require('http');
const url = require('url');
const fetch = require('node-fetch');

const PROXY_PORT = Number.parseInt(process.env.PROXY_PORT || '', 10) || 9090;
const APP_PORT = Number.parseInt(process.env.APP_PORT || '', 10) || 9090;
const APP_HOST = process.env.APP_HOST || '';
const SERVICE_ID = process.env.SERVICE_ID || 'not-specified';

const server = http.createServer((req, res) => {
    const isHealthCheck = (req.url || '').includes('/health');

    if (isHealthCheck) {
        res.writeHead(200);
        res.end('ok');
        return;
    }

    fetch(`http://${APP_HOST}:${APP_PORT}`)
        .then(r => r.json())
        .then(data => {
            const response = JSON.stringify({ data, url: req.url, serviceId: SERVICE_ID });

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(response);
        })
        .catch(error => {
            const response = JSON.stringify({
                url: req.url,
                serviceId: SERVICE_ID,
                message: 'Failed to connect to upstream',
                error: error instanceof Error ? error.message : 'unknown error',
            });

            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(response);
        });
});

server.listen(PROXY_PORT, () =>
    console.log(
        `Proxy running on port ${PROXY_PORT}, and making requests to ${`${APP_HOST}:${APP_PORT}`}`,
    ),
);
