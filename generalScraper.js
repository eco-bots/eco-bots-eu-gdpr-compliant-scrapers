const fs = require('fs');
const openai = require("openai");
const cf = require('./common-functions.js');

const apiKey = fs.readFileSync('./api_key', 'utf-8').trim();
const openAI = new openai({
    apiKey: apiKey,
});

async function main() {
    const websiteData = await cf.readCSV('./websiteDataTest.csv');
    const page = await cf.initiate();
    
    
    for (const websiteDatum of websiteData) {
        cf.prepareCSV(websiteDatum.fileName);
        await page.goto(websiteDatum.url);

        if (websiteDatum.pageVariant === 'pagination') {
            let pageLinks;
            pageLinks = await cf.getLinksFromSelector(page, websiteDatum.pageSelector, websiteDatum.url);

            for (const pageLink of pageLinks) {
                const linksToOpenCalls = await cf.getLinksFromSelector(page, websiteDatum.callSelector, websiteDatum.url);
                await cf.extractData(page, websiteDatum.fileName, linksToOpenCalls, websiteDatum.callContentSelector, openAI);
                
                await page.goto(pageLink);
            }
        } else if (websiteDatum.pageVariant === 'showMore') {
            await cf.clickButtonWhileVisible(page, websiteDatum.buttonSelector);

            const linksToOpenCalls = await cf.getLinksFromSelector(page, websiteDatum.callSelector, websiteDatum.url);
            await cf.extractData(page, websiteDatum.fileName, linksToOpenCalls, websiteDatum.callContentSelector, openAI);
        } else {
            const linksToOpenCalls = await cf.getLinksFromSelector(page, websiteDatum.callSelector, websiteDatum.url);
            await cf.extractData(page, websiteDatum.fileName, linksToOpenCalls, websiteDatum.callContentSelector, openAI);
        }
    };

    await page.close();
    console.log('SCRAPING COMPLETE');

};

main();