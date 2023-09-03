const fs = require('fs');
const openai = require("openai");
const cf = require('../../common-functions.js');

const url = 'https://www.europe-bfc.eu/agenda/?utf8=%E2%9C%93&f=1&theme=&date=&programme=';
const apiKey = fs.readFileSync('./api_key', 'utf-8').trim();
const fileName = './data/fr/bourgogneFrancheComte.csv';
const header = ['name',
                'status',
                'description',
                'start_date',
                
                'end_date',
                'requirements',
                'funding',
                'contact',
                'url',
                'application_url',
                'document_urls'];

const openAI = new openai({
    apiKey: apiKey,
});

async function main() {
    cf.prepareCSV(header, fileName);
    const [page, browser] = await cf.initiate(url);

    const openCalls = await page.$$('.page-content a');
    const urlRoot = new URL(url).origin;
    const linksToOpenCalls = await Promise.all(
        openCalls.map(async (call) => {
            const href = await call.evaluate(link => link.getAttribute('href'));
            if (href.startsWith('http')) {
                return href;
            } else {
                return urlRoot + href;
            }
        })
    );

    for (const link of linksToOpenCalls) {
        const response = await page.goto(link);
        if (response.status() === 404) {
            continue;
        };

        const textContent = await page.$eval('article', content => content.innerText);
        const [name, description, startDate, endDate, funding, requirements, contact, url] = await Promise.all([
            cf.extractName(textContent, openAI),
            cf.extractDescription(textContent, openAI),
            cf.extractStartDate(textContent, openAI),
            cf.extractEndDate(textContent, openAI),
            cf.extractFunding(textContent, openAI),
            cf.extractRequirements(textContent, openAI),
            cf.extractContact(textContent, openAI),
            page.url(),
        ]);
        const status = await cf.evaluateStatus(endDate);
        if (status === 'closed') {
            continue;
        };

        const applicationUrl = 'NA';

        const documentUrls = await page.evaluate(() => {
            let links = document.querySelectorAll('.related-ressources a');
            const linksTextArray = Array.from(links).map(link => {
                const fileName = link.textContent;
                const href = link.getAttribute('href');
                if (href.startsWith('http')){
                    return fileName.replace(/\s+/g, ' ').trim() + ': ' + href;
                } else {
                    return fileName.replace(/\s+/g, ' ').trim() + ': ' + urlRoot + href;
                }
            });
            return linksTextArray.join('\n');
        });

        await cf.writeToCSV(fileName, name, status, description, startDate, endDate,
                            requirements, funding, contact, url, applicationUrl, documentUrls);
    };

    await browser.close();
    console.log('SCRAPING COMPLETE');
}

main();