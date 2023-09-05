const fs = require('fs');
const csv = require("csv-parser");

const moment = require('moment');
const puppeteer = require("puppeteer-extra");

async function initiate (url) {
    console.log("-----------------------------");
    console.log("Starting...");
    
    var browser = await puppeteer.launch({
        headless: false,
        userDataDir: "./user_data",
    });
    
    console.log("Opening Browser");
    var page = await browser.newPage();
    await page.setDefaultNavigationTimeout(0);

    console.log("Going to URL");
    await page.goto(url, {
        waitUntil: 'networkidle2',
        timeout: 0,
    });
    
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

function prepareCSV(header, fileName) {
    let csvContent = header.join(',') + '\n';

    fs.writeFile(fileName, csvContent, (err) => {
        if (err) throw err;
        console.log('CSV saved');
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
        messages: [{ role: 'user', content: text + 'Extract the start date of the project from the text and return it in the format "DD.MM.YYYY". Return the shortest response possible.' }],
        model: 'gpt-3.5-turbo',
    });

    return startDatePromise; 
    //moment(startDate.choices[0]['message']['content'], 'DD.MM.YYYY').format('DD MMMM YYYY');
}

async function extractEndDate(text, openAI) {
    const endDatePromise = openAI.chat.completions.create({
        messages: [{ role: 'user', content: text + 'Extract the closing date of the project from the text and return it in the format "DD.MM.YYYY". Return the shortest response possible.' }],
        model: 'gpt-3.5-turbo',
    });

    return endDatePromise; 
    //moment(endDate.choices[0]['message']['content'], 'DD.MM.YYYY').format('DD MMMM YYYY');
}

async function extractFunding(text, openAI) {
    const fundingPromise = openAI.chat.completions.create({
        messages: [{ role: 'user', content: text + 'Extract the total funding or budget amount of the project from the text without currency. Exclude any additional text. If the funding is not given say NA.' }],
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
        messages: [{ role: 'user', content: text + 'Extract the name, email, phone number of the person or institution from the text. Return the shortest response possible. If the contact information is not given say NA.' }],
        model: 'gpt-3.5-turbo',
    });

    return contactPromise;
}

async function evaluateStatus(endDate) {
    const today = moment();
    const end = moment(endDate, 'DD.MM.YYYY');
    if (today.isAfter(end)) {
        return 'closed';
    } else {
        return 'open';
    };
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

async function clickButtonWhileVisible(page, selector){
    let buttonVisible = true;
    while (buttonVisible) {
        const button = await page.$(selector);
        if (button) {
            await button.click();
            await page.waitForTimeout(1000);
        } else {
            buttonVisible = false;
        };
    };
}

async function login(page, username, password, usernameSelector, passwordSelector, submitSelector) {
    await page.waitForSelector(usernameSelector);
    await page.type(usernameSelector, username);
    await page.type(passwordSelector, password);
    await page.click(submitSelector);
    await page.waitForTimeout(1000);
}

function withRetry(fn, maxRetries = 3, requestTimeout = 20000, initialDelay = 5000) {
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

function wordToNumber(str) {
    const wordMultipliers = {
      'thousand': 1e3,
      'million': 1e6,
      'billion': 1e9,
      'trillion': 1e12,
    };
  
    const regex = /([\d,.\s]+)\s*(thousand|million|billion|trillion)?/i;
    const match = str.match(regex);
  
    if (!match) return 'NA';
  
    let [, number, wordMultiplier] = match;
    
    number = parseFloat(number.replace(/[^0-9.]/g, ''));
    
    if (wordMultiplier) {
      wordMultiplier = wordMultiplier.toLowerCase();
      if (wordMultipliers[wordMultiplier]) {
        number *= wordMultipliers[wordMultiplier];
      }
    }
  
    return number;
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

const extractNameWithRetry = withRetry(extractName);
const extractDescriptionWithRetry = withRetry(extractDescription);
const extractStartDateWithRetry = withRetry(extractStartDate);
const extractEndDateWithRetry = withRetry(extractEndDate);
const extractFundingWithRetry = withRetry(extractFunding);
const extractRequirementsWithRetry = withRetry(extractRequirements);
const extractContactWithRetry = withRetry(extractContact);

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
    login,
    readCSV,
    wordToNumber,
};

