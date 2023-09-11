const fs = require('fs');
const path = require('path');
const csv = require("csv-parser");
const numeral = require("numeral");

const moment = require('moment');
const puppeteer = require("puppeteer-extra");

async function initiate () {
    console.log("-----------------------------");
    console.log("Starting...");
    
    var browser = await puppeteer.launch({
        headless: false,
        userDataDir: "./user_data",
    });
    
    console.log("Opening Browser");
    var page = await browser.newPage();
    await page.setDefaultNavigationTimeout(0);
    
    return page;
}

function escapeCSV(str) {
    let hasSpecialChar = /[",;\n]/.test(str);
    if (hasSpecialChar) {
      // Double up on quotes to escape them
      let escaped = str.replace(/"/g, '""');
      return '"' + escaped + '"';
    } else {
      return str;
    }
}

function prepareCSV(fileName) {
    const header = ['name',
                'status',
                'description',
                'start_date',
                'end_date',
                'requirements',
                'funding',
                'contact',
                'url',];

    let csvContent = header.join(',') + '\n';

    const directory = path.dirname(fileName);
    if (!fs.existsSync(directory)) {
        fs.mkdirSync(directory, { recursive: true });
    }

    fs.writeFile(fileName, csvContent, (err) => {
        if (err) throw err;
        console.log('CSV saved');
    });
}

async function readCSV(fileName) {
    const websiteData = [];
    
    return new Promise((resolve, reject) => {
      fs.createReadStream(fileName)
        .pipe(csv())
        .on('data', (data) => websiteData.push(data))
        .on('end', () => {
          resolve(websiteData);
        })
        .on('error', (error) => {
          reject(error);
        });
    });
}

async function writeToCSV(fileName, name, status, description, start_date, end_date,
    requirements, funding, contact, url) {
    let newLine = escapeCSV(name) + ',' +
    escapeCSV(status) + ',' +
    escapeCSV(description) + ',' + 
    escapeCSV(start_date) + ',' + 
    escapeCSV(end_date) + ',' + 
    escapeCSV(requirements) + ',' +
    escapeCSV(funding) + ',' +
    escapeCSV(contact) + ',' +
    escapeCSV(url) + ',' + '\n'; 
    fs.appendFile(fileName, newLine, (err) => {
        if (err) throw err;
        console.log('CSV UPDATED');
    });
}

async function extractName(text, openAI) {
    const namePromise = openAI.chat.completions.create({
        messages: [{ role: 'user', content: text + 'Extract the name of the project from the text. Return the shortest response possible.' }],
        model: 'gpt-3.5-turbo',
    });

    return namePromise;
}

async function extractDescription(text, openAI) {
    const descriptionPromise = openAI.chat.completions.create({
        messages: [{ role: 'user', content: text + 'Extract the description of the project from the text. Return the shortest response possible.' }],
        model: 'gpt-3.5-turbo',
    });

    return descriptionPromise;
}

async function extractStartDate(text, openAI) {
    const startDatePromise = openAI.chat.completions.create({
        messages: [{ role: 'user', content: text + "Extract the date that indicates when the actual application period starts from the text. Do not confuse it with the update date of the article. Return it in 'DD.MM.YYYY' format. If not available, say 'NA'." }],
        model: 'gpt-3.5-turbo',
    });

    return startDatePromise; 
}

async function extractEndDate(text, openAI) {
    const endDatePromise = openAI.chat.completions.create({
        messages: [{ role: 'user', content: text + "Extract the date that indicates when the actual application period ends from the text. Do not confuse it with the update date of the article. Return it in 'DD.MM.YYYY' format. If not available, say 'NA'." }],
        model: 'gpt-3.5-turbo',
    });

    return endDatePromise; 
}

async function extractFunding(text, openAI) {
    const fundingPromise = openAI.chat.completions.create({
        messages: [{ role: 'user', content: text + 'Extract the total funding or budget amount of the project from the text. Exclude any additional text. If the funding is not given say NA.' }],
        model: 'gpt-3.5-turbo',
    });

    return fundingPromise; 
}

async function extractRequirements(text, openAI) {
    const requirementsPromise = openAI.chat.completions.create({
        messages: [{ role: 'user', content: text + 'Extract the requirements of the project from the text. Return only the requirements themselves.' }],
        model: 'gpt-3.5-turbo',
    });

    return requirementsPromise;
}

async function extractContact(text, openAI) {
    const contactPromise = openAI.chat.completions.create({
        messages: [{ role: 'user', content: text + 'Extract the contact information of the person or institution from the text. Return the shortest response possible. If the contact information is not given say NA.' }],
        model: 'gpt-3.5-turbo',
    });

    return contactPromise;
}

async function evaluateStatus(endDate) {
    if (endDate === 'NA'){
        return 'NA';
    }

    const today = moment();
    const end = moment(endDate, 'DD MMMM YYYY');
    if (today.isAfter(end)) {
        return 'closed';
    } else {
        return 'open';
    };
}

function withRetry(fn, maxRetries = 3, requestTimeout = 30000, initialDelay = 5000) {
    return async function (...args) {
        for (let i = 0; i <= maxRetries; i++) {
            const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => {
                    reject(new Error('Request timed out.'));
                }, requestTimeout);
            });

            try {
                const result = await Promise.race([fn(...args), timeoutPromise]);
                return result.choices[0]['message']['content'];
            } catch (error) {
                console.error(`Attempt ${i} failed: ${error.message}. Retrying...`);
                
                if (i === maxRetries) {
                    throw new Error(`Function failed after ${maxRetries} retries.`);
                }

                await new Promise(res => setTimeout(res, initialDelay * Math.pow(2, i)));
            }
        }
    };
}

const extractNameWithRetry = withRetry(extractName);
const extractDescriptionWithRetry = withRetry(extractDescription);
const extractStartDateWithRetry = withRetry(extractStartDate);
const extractEndDateWithRetry = withRetry(extractEndDate);
const extractFundingWithRetry = withRetry(extractFunding);
const extractRequirementsWithRetry = withRetry(extractRequirements);
const extractContactWithRetry = withRetry(extractContact);

async function getLinksFromSelector(page, selector, url) {
    const elements = await page.$$(selector);
    const urlRoot = new URL(url).origin;
    const links = await Promise.all(
        elements.map(async (element) => {
            const href = await element.evaluate(link => link.getAttribute('href'));
            if (href.startsWith('http')) {
                return href;
            } else {
                return urlRoot + '/' + href;
            }
        })
    );

    return links;
}

async function clickButtonWhileVisible(page, selector){
    while (true) {
        try {
            await page.waitForSelector(selector, { timeout: 20000 });
            const button = await page.$(selector);
            await button.click();
            await page.waitForTimeout(2000);
        } catch (error) {
            if (error.message.includes('Waiting for selector')) {
                break;
            } else {
                throw error;
            }
        }
    }
}

function formatDate(date) {
    const cleanedDate = date.match(/\b\d{2}\.\d{2}\.\d{4}\b/g);
    if (cleanedDate) {
        return moment(cleanedDate, 'DD.MM.YYYY').format('DD MMMM YYYY');
    } else {
        return 'NA';
    }
}

async function extractTextAroundDates(text, n = 50) {
    const dateRegex = new RegExp(`[^]{0,${n}}(\\d{2}\\/\\d{2}\\/\\d{4})[^]{0,${n}}`, 'g');
    const matches = text.match(dateRegex);
    return matches ? matches.join(' ') : 'NA';
}

async function extractData(page, fileName, links, openAI){
    const url = await page.url();
    const urlRoot = new URL(url).origin;
    for (const link of links) {
        const response = await page.goto(link);
        if (response.status() === 404) {
            continue;
        };

        if (!link.startsWith(urlRoot)) {
            continue;
        };

        const textContent = await page.$eval('body', content => content.innerText);
        const dateText = await extractTextAroundDates(textContent);
        let name, description, startDate, endDate, funding, requirements, contact, url;
        await Promise.all([
            extractNameWithRetry(textContent, openAI),
            extractDescriptionWithRetry(textContent, openAI),
            extractStartDateWithRetry(dateText, openAI),
            extractEndDateWithRetry(dateText, openAI),
            extractFundingWithRetry(textContent, openAI),
            extractRequirementsWithRetry(textContent, openAI),
            extractContactWithRetry(textContent, openAI),
            page.url()
        ])
        .then((results) => {
            console.log('GPT query successful.');
            [name, description, startDate, endDate, funding, requirements, contact, url] = results;

            if (!(startDate === 'NA')) startDate = formatDate(startDate);
            if (!(endDate === 'NA')) endDate = formatDate(endDate);
        })
        .catch((error) => {
            if (error.message.includes('Function failed after')) {
                console.log('GPT query failed.'); 
                [name, description, startDate, endDate, funding, requirements, contact, url] = ['NA', 'NA', 'NA', 'NA', 'NA', 'NA', 'NA', 'NA'];
            } else {
                throw error;
            }
        });

        const status = await evaluateStatus(endDate);
        if (status === 'closed') {
            continue;
        };

        await writeToCSV(fileName, name, status, description, startDate, endDate, requirements, funding, contact, url);
    }

}

module.exports = {
    initiate,
    escapeCSV,
    prepareCSV,
    extractNameWithRetry,
    extractDescriptionWithRetry,
    extractStartDateWithRetry,
    extractEndDateWithRetry,
    extractFundingWithRetry,
    extractRequirementsWithRetry,
    extractContactWithRetry,
    evaluateStatus,
    writeToCSV,
    clickButtonWhileVisible,
    readCSV,
    getLinksFromSelector,
    extractData,
};