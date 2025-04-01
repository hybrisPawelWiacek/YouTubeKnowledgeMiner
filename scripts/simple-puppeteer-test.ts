/**
 * Simple test for Puppeteer browser functionality
 * This script tests whether Puppeteer can launch a browser
 * and navigate to a basic webpage in the Replit environment
 */

import puppeteer from 'puppeteer';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

// ES Module workaround for __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function testPuppeteer() {
  console.log('Starting simple Puppeteer test...');
  
  try {
    console.log('Launching browser...');
    const chromiumPath = '/nix/store/zi4f80l169xlmivz8vja8wlphq74qqk0-chromium-125.0.6422.141/bin/chromium-browser';
    console.log(`Using Chromium at: ${chromiumPath}`);
    
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
      timeout: 30000,
      executablePath: chromiumPath
    });
    
    console.log('Browser launched successfully!');
    
    console.log('Opening new page...');
    const page = await browser.newPage();
    
    console.log('Navigating to example.com...');
    await page.goto('https://example.com', { 
      waitUntil: 'domcontentloaded',
      timeout: 15000 
    });
    
    console.log('Page loaded successfully!');
    
    const title = await page.title();
    console.log(`Page title: ${title}`);
    
    // Make sure logs directory exists
    const logsDir = path.join(__dirname, '../logs');
    if (!fs.existsSync(logsDir)) {
      console.log(`Creating logs directory: ${logsDir}`);
      fs.mkdirSync(logsDir, { recursive: true });
    }
    
    // Take a screenshot as evidence
    const screenshotPath = path.join(logsDir, 'example-com.png');
    console.log(`Taking screenshot: ${screenshotPath}`);
    await page.screenshot({ path: screenshotPath });
    
    console.log('Closing browser...');
    await browser.close();
    
    console.log('Test completed successfully!');
    return true;
  } catch (error: any) {
    console.error('Error during Puppeteer test:', error?.message || 'Unknown error');
    return false;
  }
}

testPuppeteer()
  .then(success => {
    console.log(`Test ${success ? 'PASSED' : 'FAILED'}`);
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });