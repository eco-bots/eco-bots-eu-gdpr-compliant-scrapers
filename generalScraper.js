const fs = require('fs');
const openai = require("openai");
const cf = require('./common-functions.js');

const apiKey = fs.readFileSync('./api_key', 'utf-8').trim();
const openAI = new openai({
    apiKey: apiKey,
});

async function main() {
    const websiteData = await cf.readCSV('./websiteData.csv');
    const page = await cf.initiate();
    
    for (const websiteDatum of websiteData) {
        cf.prepareCSV(websiteDatum.fileName);
        await page.goto(websiteDatum.url);

        const linksToOpenCalls = await cf.getLinksFromSelector(page, websiteDatum.callSelector, websiteDatum.url);

        if (websiteDatum.pageVariant === 'pagination') {
            
        };

        for (const link of linksToOpenCalls) {
            const response = await page.goto(link);
            if (response.status() === 404) {
                continue;
            };
    
            const textContent = await page.$eval(websiteDatum.callContentSelector, content => content.innerText);
            let name, description, startDate, endDate, funding, requirements, contact, url;
            await Promise.all([
                cf.extractNameWithRetry(textContent, openAI),
                cf.extractDescriptionWithRetry(textContent, openAI),
                cf.extractStartDateWithRetry(textContent, openAI),
                cf.extractEndDateWithRetry(textContent, openAI),
                cf.extractFundingWithRetry(textContent, openAI),
                cf.extractRequirementsWithRetry(textContent, openAI),
                cf.extractContactWithRetry(textContent, openAI),
                page.url()
            ])
            .then((results) => {
                console.log('GPT query successful.');
                [name, description, startDate, endDate, funding, requirements, contact, url] = results;
    
                if (!(startDate === 'NA')) startDate = cf.formatDate(startDate);
                if (!(endDate === 'NA')) endDate = cf.formatDate(endDate);
                // funding = cf.wordToNumber(funding);
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
    
            await cf.writeToCSV(websiteDatum.fileName, name, status, description, startDate, endDate, requirements, funding, contact, url);
        };

        await page.close();
        console.log('SCRAPING COMPLETE');
    };

};

main();