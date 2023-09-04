const fs = require('fs');
const openai = require("openai");
const cf = require('../../common-functions.js');

const url = 'https://www.europeenauvergnerhonealpes.fr/aides-europeennes';
const apiKey = fs.readFileSync('../../api_key', 'utf-8').trim();
const fileName = '../../data/fr/auvergneRhoneAlpes.csv';
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

    await cf.clickButtonWhileVisible(page, '.pager__item a');

    const openCalls = await page.$$('.views-infinite-scroll-content-wrapper a');
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
        console.log('Going to URL');
        const response = await page.goto(link);
        if (response.status() === 404) {
            continue;
        };

        const textContent = await page.$eval('body', content => content.innerText);
        console.log('Querying GPT');

        let name, description, startDate, endDate, funding, requirements, contact, url;
        await Promise.all([
            cf.extractNameWithRetry(textContent, openAI),
            cf.extractDescriptionWithRetry(textContent, openAI),
            cf.extractStartDateWithRetry(textContent, openAI),
            cf.extractEndDateWithRetry(textContent, openAI),
            cf.extractFundingWithRetry(textContent, openAI),
            cf.extractRequirementsWithRetry(textContent, openAI),
            cf.extractContactWithRetry(textContent, openAI),
            page.url(),
        ])
        .then((results) => {
            console.log('GPT query successful.');
            [name, description, startDate, endDate, funding, requirements, contact, url] = results;

            if (!(startDate === 'NA')) startDate = cf.formatDate(startDate);
            if (!(endDate === 'NA')) endDate = cf.formatDate(endDate);
            funding = cf.wordToNumber(funding);
        })
        .catch((error) => {
            if (error.message.includes('Function failed after')) {
                console.log('GPT query failed.'); 
                [name, description, startDate, endDate, funding, requirements, contact, url] = ['NA', 'NA', 'NA', 'NA', 'NA', 'NA', 'NA', 'NA'];
            }
        });

        const status = await cf.evaluateStatus(endDate);
        if (status === 'closed') {
            continue;
        };

        const applicationUrl = 'NA';
        const documentUrls = 'NA';

        await cf.writeToCSV(fileName, name, status, description, startDate, endDate,
                            requirements, funding, contact, url, applicationUrl, documentUrls);
    };

    await browser.close();
    console.log('SCRAPING COMPLETE');
}

main();