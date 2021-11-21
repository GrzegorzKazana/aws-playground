// in hindsight, I probably should just have used public lambda layer instead
// https://acloudguru.com/blog/engineering/serverless-browser-automation-with-aws-lambda-and-puppeteer
//
// but sill, I wanted to accept the challenge of deploying something with native deps via docker
const puppeteer = require('puppeteer');

const browserP = puppeteer.launch({
    headless: true,
    args: [
        '--no-sandbox',
        '--disable-gpu',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--single-process',
    ],
});

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
