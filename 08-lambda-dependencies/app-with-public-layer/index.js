const chromium = require('chrome-aws-lambda');

const browserP = chromium.executablePath.then(executablePath =>
    chromium.puppeteer.launch({
        executablePath,
        args: chromium.args,
        defaultViewport: chromium.defaultViewport,
        headless: chromium.headless,
        ignoreHTTPSErrors: true,
    }),
);

module.exports.handler = async (event, _context) => {
    const { url } = event.queryStringParameters || {};

    if (!url)
        return {
            statusCode: 200,
            headers: { 'content-type': 'text/plain' },
            body: 'No url query parameter specified',
        };

    const body = await withNewPage(page =>
        page
            .goto(decodeURIComponent(url), { waitUntil: 'networkidle0' })
            .then(() => page.content()),
    );

    return {
        statusCode: 200,
        headers: { 'content-type': 'text/html' },
        body,
    };
};

async function withNewPage(fn) {
    const browser = await browserP;
    const page = await browser.newPage();

    return fn(page).finally(() => page.close());
}
