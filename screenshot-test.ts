/**
 * Super minimal Puppeteer test to just capture screenshots of a YouTube video page
 * This will help diagnose what's happening with the transcript extraction
 */

import * as puppeteer from 'puppeteer';
import * as fs from 'fs';
import * as path from 'path';

async function capturePageScreenshots(videoId: string): Promise<boolean> {
  // Create a logs directory if it doesn't exist
  const logsDir = path.join(process.cwd(), 'logs');
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }
  
  const screenshotPath = (name: string) => path.join(logsDir, `${name}-${videoId}.png`);
  
  // Use a shorter timeout
  const chromiumPath = '/nix/store/zi4f80l169xlmivz8vja8wlphq74qqk0-chromium-125.0.6422.141/bin/chromium-browser';
  console.log(`Launching browser with Chromium at: ${chromiumPath}`);
  
  // Launch with minimal settings
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    timeout: 5000,
    executablePath: chromiumPath
  });
  
  try {
    console.log('Browser launched, opening page...');
    const page = await browser.newPage();
    
    // Set smaller viewport
    await page.setViewport({ width: 800, height: 600 });
    
    // Navigate to video
    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
    console.log(`Navigating to: ${videoUrl}`);
    await page.goto(videoUrl, { waitUntil: 'domcontentloaded', timeout: 10000 });
    console.log('Page loaded');
    
    // Take initial screenshot
    await page.screenshot({ path: screenshotPath('initial') });
    console.log(`Screenshot saved to: ${screenshotPath('initial')}`);
    
    // Try keyboard shortcut for transcript
    console.log('Pressing Ctrl+J to open transcript...');
    await page.keyboard.down('Control');
    await page.keyboard.press('KeyJ');
    await page.keyboard.up('Control');
    
    // Wait for possible transcript panel to appear
    console.log('Waiting after keyboard shortcut...');
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Take screenshot after keyboard shortcut
    await page.screenshot({ path: screenshotPath('after-shortcut') });
    console.log(`Screenshot saved to: ${screenshotPath('after-shortcut')}`);
    
    // Look for transcript segments
    console.log('Checking for transcript elements...');
    const transcriptInfo = await page.evaluate(() => {
      // Look for transcript elements in various ways
      const segments = document.querySelectorAll('ytd-transcript-segment-renderer, div.segment');
      const panel = document.querySelector('ytd-engagement-panel-section-list-renderer');
      
      // Find any buttons with transcript text
      const buttons = Array.from(document.querySelectorAll('button'))
        .filter(btn => btn.textContent?.toLowerCase().includes('transcript'))
        .map(btn => btn.textContent?.trim());
      
      return {
        segmentCount: segments.length,
        hasPanel: !!panel,
        transcriptButtons: buttons
      };
    });
    
    console.log('Transcript element check results:', transcriptInfo);
    
    // Try to find and click any "Show transcript" button if found
    if (transcriptInfo.transcriptButtons.length > 0) {
      console.log('Found transcript button(s), attempting to click...');
      
      const buttonClicked = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        for (const btn of buttons) {
          if (btn.textContent?.toLowerCase().includes('transcript')) {
            btn.click();
            return true;
          }
        }
        return false;
      });
      
      console.log(`Transcript button ${buttonClicked ? 'clicked' : 'not clicked'}`);
      
      // Wait for possible transcript panel to appear
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Take screenshot after button click
      await page.screenshot({ path: screenshotPath('after-button-click') });
      console.log(`Screenshot saved to: ${screenshotPath('after-button-click')}`);
    }
    
    return true;
  } catch (error: any) {
    console.error('Error during test:', error?.message || error);
    return false;
  } finally {
    await browser.close();
    console.log('Browser closed');
  }
}

// Use a very short YouTube video
const videoId = 'jNQXAC9IVRw'; // First YouTube video: "Me at the zoo"

// Run test
capturePageScreenshots(videoId)
  .then(success => {
    console.log(`Test ${success ? 'completed successfully' : 'failed'}`);
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error('Unexpected error:', error);
    process.exit(1);
  });