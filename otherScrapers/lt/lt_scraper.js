const fs = require('fs');

const openai = require("openai");
const moment = require('moment');
const {initiate, escapeCSV, prepareCSV} = require('./common-functions.js');

const url = 'https://www.esinvesticijos.lt/kvietimai-2?_token=977c83.ZeDebUE95NiBa7K_cLCeT4iBI0DKGy_MhXkePwt07gY.D7WbIAtu0OzCCPnuAfnkCrjHdnSlUnD06xp3Z0AF2HYOlJYGGXCUsdIC1Q&query=&submission_to=&status%5B%5D=45&ordering=';
const apiKey = fs.readFileSync('./api_key', 'utf-8').trim();
const fileName = 'output.csv';
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

start();

async function start() {
    prepareCSV(header, fileName);
    const page = await initiate(url, apiKey);

    const numPages = await page.evaluate(() => {
        return document.querySelectorAll('div.pages a').length
    });
    console.log("numPages: " + numPages);

    for (var i = 0; i < numPages; i++) {
        const numOpenCalls = await page.evaluate(() => {
            return document.querySelectorAll('div.container tr td:first-child a').length
        });
        
        console.log("numOpenCalls: " + numOpenCalls);

        for (var index = 0; index < numOpenCalls; index++) {
            await page.evaluate((index) => {
                document.querySelectorAll('div.container tr td:first-child a')[index].click();
            }, index);
            await page.waitForNavigation({ waitUntil: 'networkidle2' });

            var text = await page.evaluate(() => {
                return document.querySelector('#content').innerText;
            });

            var name = await page.evaluate(() => {
                return document.querySelector('h1').innerText;
            });
            console.log('name: '+name);

            const descriptionPattern = /(?<=Aprašymas\n)([\s\S]*?)(?=\nBendrieji reikalavimai)/;
            const description = text.match(descriptionPattern)[0];
            console.log('description: '+description);

            const datePattern = /(?<=Projekto įgyvendinimo plano pateikimo terminas\n)([\s\S]*?)(?=\nAprašymas)/;
            const dateText = text.match(datePattern);

            var start_date = await openAI.chat.completions.create({
                messages: [{ role: 'user', content: dateText + 'Extract the start date of the project from the text and return it in the format "DD.MM.YYYY". Return the shortest response possible.'}],
                model: 'gpt-3.5-turbo',
            });
            start_date = moment(start_date.choices[0]['message']['content'], 'DD.MM.YYYY').format('DD MMMM YYYY');
            console.log('start_date: '+start_date);

            var end_date = await openAI.chat.completions.create({
                messages: [{ role: 'user', content: dateText + 'Extract the closing date of the project from the text and return it in the format "DD.MM.YYYY". Return the shortest response possible.'}],
                model: 'gpt-3.5-turbo',
            });
            end_date = moment(end_date.choices[0]['message']['content'], 'DD.MM.YYYY').format('DD MMMM YYYY');
            console.log('end_date: '+end_date);

            const fundingPattern = /(?<=Finansavimo suma\n)([\s\S]*?)(?=\nAtsakinga institucija)/;
            const fundingText = text.match(fundingPattern);

            var funding = await openAI.chat.completions.create({
                messages: [{ role: 'user', content: fundingText + 'Extract the total funding or budget amount of the project from the text without currency. Exclude any additional text. If the information about funding is not given say NA.' }],
                model: 'gpt-3.5-turbo',
            });
            funding = funding.choices[0]['message']['content'].replace(/[!"#$%&'()*+,-./:;<=>?@[\]^_`{|}~]/g, ' ');;
            console.log('funding: '+funding);

            const requirementsPattern = /(?<=Bendrieji reikalavimai\n)([\s\S]*?)(?=\nProjekto įgyvendinimo plano teikimas)/;
            const requirements = text.match(requirementsPattern)[0];
            console.log('requirements: '+requirements);

            const contactPattern = /(?<=Kontaktiniai asmenys\n)([\s\S]*?)(?=\nVeiklos sritis)/;
            const contactMatch = text.match(contactPattern);
            const contact = contactMatch ? contactMatch[0] : '';
            console.log('contact: '+contact);

            const url = await page.url();
            console.log('url: '+url);

            var documentUrls = await page.evaluate(() => {
                const numLinks = document.querySelectorAll('#related_documents a').length;
                let links = Array.from(document.querySelectorAll('#related_documents a')).slice(2, numLinks + 1);
                const linksTextArray = Array.from(links).map(link => {
                    const fileName = link.textContent
                    const href = link.getAttribute('href');
                    return fileName.trim() + ': ' + href;
                });
                return linksTextArray.join('\n');
            });
            console.log('documentUrls: '+documentUrls);

            const applicationUrl = '';
            const status = 'open';

            let newLine = escapeCSV(name) + ',' +
                    status + ',' +
                    escapeCSV(description) + ',' + 
                    escapeCSV(start_date) + ',' + 
                    escapeCSV(end_date) + ',' + 
                    escapeCSV(requirements) + ',' +
                    escapeCSV(funding) + ',' +
                    escapeCSV(contact) + ',' +
                    escapeCSV(url) + ',' + 
                    escapeCSV(applicationUrl) + ',' + 
                    escapeCSV(documentUrls) + ',' + '\n'; 
            fs.appendFile(fileName, newLine, (err) => {
                if (err) throw err;
                console.log('CSV UPDATED');
            });
            await page.goBack();
        };
        await page.evaluate((i) => {
            document.querySelectorAll('div.pages a.btn.bg-pink')[i].click();
        }, i);
        await page.waitForNavigation({ waitUntil: 'networkidle2' });
    };
}

console.log("Finished");