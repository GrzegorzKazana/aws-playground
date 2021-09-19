const http = require('http');

const APP_PORT = Number.parseInt(process.env.APP_PORT, 10) || 9090;

const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
        JSON.stringify({
            data: 'Hello World!',
            date: new Date().toISOString(),
            url: req.url,
        }),
    );
});

server.listen(APP_PORT, () => console.log(`Server running on port ${APP_PORT}`));
