const fs = require('fs');

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
    const name = await openAI.chat.completions.create({
        messages: [{ role: 'user', content: text + 'Extract the name of the project from the text. Return the shortest response possible.' }],
        model: 'gpt-3.5-turbo',
    });

    return name.choices[0]['message']['content'];
}

async function extractDescription(text, openAI) {
    const description = await openAI.chat.completions.create({
        messages: [{ role: 'user', content: text + 'Extract the description of the project from the text. Return the shortest response possible.' }],
        model: 'gpt-3.5-turbo',
    });

    return description.choices[0]['message']['content'];
}

async function extractStartDate(text, openAI) {
    const startDate = await openAI.chat.completions.create({
        messages: [{ role: 'user', content: text + 'Extract the start date of the project from the text and return it in the format "DD.MM.YYYY". Return the shortest response possible.' }],
        model: 'gpt-3.5-turbo',
    });

    return moment(startDate.choices[0]['message']['content'], 'DD.MM.YYYY').format('DD MMMM YYYY');
}

async function extractEndDate(text, openAI) {
    const endDate = await openAI.chat.completions.create({
        messages: [{ role: 'user', content: text + 'Extract the closing date of the project from the text and return it in the format "DD.MM.YYYY". Return the shortest response possible.' }],
        model: 'gpt-3.5-turbo',
    });

    return moment(endDate.choices[0]['message']['content'], 'DD.MM.YYYY').format('DD MMMM YYYY');
}

async function extractFunding(text, openAI) {
    const funding = await openAI.chat.completions.create({
        messages: [{ role: 'user', content: text + 'Extract the total funding or budget amount of the project from the text without currency. Exclude any additional text. If the funding is not given say NA.' }],
        model: 'gpt-3.5-turbo',
    });

    return funding.choices[0]['message']['content'];
}

async function extractRequirements(text, openAI) {
    const requirements = await openAI.chat.completions.create({
        messages: [{ role: 'user', content: text + 'Extract the requirements of the project from the text. Return only the requirements themselves.' }],
        model: 'gpt-3.5-turbo',
    });

    return requirements.choices[0]['message']['content'];
}

async function extractContact(text, openAI) {
    const contact = await openAI.chat.completions.create({
        messages: [{ role: 'user', content: text + 'Extract the name, email, phone number of the person or institution from the text. Return the shortest response possible. If the contact information is not given say NA.' }],
        model: 'gpt-3.5-turbo',
    });

    return contact.choices[0]['message']['content'];
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

async function extractApplicationUrl(text, openAI) {
    const applicationUrl = openAI.chat.completions.create({
        messages: [{ role: 'user', content: text + 'Extract the application URL of the project from the text. Return only the URL itself. If the URL is not given say NA.' }],
        model: 'gpt-3.5-turbo',
    });

    return applicationUrl.choices[0]['message']['content'];
}

async function extractDocumentUrls(text, openAI) {
    const applicationUrl = openAI.chat.completions.create({
        messages: [{ role: 'user', content: text + 'Extract the document URLs of the project that are not application URLs from the text. Return only the URLs itself. If the URLs are not given say NA.' }],
        model: 'gpt-3.5-turbo',
    });

    return applicationUrl.choices[0]['message']['content'];
}

async function writeToCSV(fileName, name, status, description, start_date, end_date,
                          requirements, funding, contact, url, applicationUrl, documentUrls) {
    let newLine = escapeCSV(name) + ',' +
            escapeCSV(status) + ',' +
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

const withRetry = (fn, maxRetries = 3, delay = 5000, timeout = 20000) => {
    return async (...args) => {
      let retries = 0;
      let currentDelay = delay;
  
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => {
          reject(new Error('Function timed out.'));
        }, timeout);
      });
  
      while (retries < maxRetries) {
        const fnPromise = fn(...args);
        try {
          return await Promise.race([fnPromise, timeoutPromise]);
        } catch (error) {
          retries++;
          if (retries >= maxRetries) {
            throw new Error(`Function failed after ${maxRetries} retries.`);
          }
          await new Promise(resolve => setTimeout(resolve, currentDelay));
          currentDelay = currentDelay * 2;
        }
      }
    };
};

const extractNameWithRetry = withRetry(extractName);
const extractDescriptionWithRetry = withRetry(extractDescription);
const extractStartDateWithRetry = withRetry(extractStartDate);
const extractEndDateWithRetry = withRetry(extractEndDate);
const extractFundingWithRetry = withRetry(extractFunding);
const extractRequirementsWithRetry = withRetry(extractRequirements);
const extractContactWithRetry = withRetry(extractContact);
const extractApplicationUrlWithRetry = withRetry(extractApplicationUrl);
const extractDocumentUrlsWithRetry = withRetry(extractDocumentUrls);

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
    extractApplicationUrlWithRetry,
    extractDocumentUrlsWithRetry,
    writeToCSV,
    clickButtonWhileVisible,
    login,
};

