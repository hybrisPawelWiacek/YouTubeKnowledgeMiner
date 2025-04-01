/**
 * Simplified YouTube transcript extractor for testing purposes
 * This version focuses on a simpler, more direct approach with fewer fallbacks
 */

import * as puppeteer from 'puppeteer';
import * as fs from 'fs';
import * as path from 'path';

async function extractTranscript(videoId: string): Promise<any[]> {
  // Define chromium path for Replit
  const chromiumPath = '/nix/store/zi4f80l169xlmivz8vja8wlphq74qqk0-chromium-125.0.6422.141/bin/chromium-browser';
  console.log(`Using Chromium at: ${chromiumPath}`);
  
  // Launch browser with minimal settings
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    timeout: 10000,
    executablePath: chromiumPath
  });
  
  console.log('Browser launched');
  
  try {
    // Create a new page
    const page = await browser.newPage();
    
    // Set a smaller viewport to reduce resource usage
    await page.setViewport({ width: 1024, height: 768 });
    
    // Navigate to video
    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
    console.log(`Navigating to: ${videoUrl}`);
    await page.goto(videoUrl, { waitUntil: 'domcontentloaded', timeout: 10000 });
    console.log('Page loaded');
    
    // Wait for video player
    await page.waitForSelector('.html5-video-container', { timeout: 10000 });
    console.log('Video player found');
    
    // Take a screenshot for debug
    await page.screenshot({ path: 'page-loaded.png' });
    
    // Try keyboard shortcut method first (usually more reliable)
    console.log('Trying keyboard shortcut (Ctrl+J) to open transcript');
    await page.keyboard.down('Control');
    await page.keyboard.press('KeyJ');
    await page.keyboard.up('Control');
    
    // Wait for transcript to appear
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Take screenshot after shortcut
    await page.screenshot({ path: 'after-shortcut.png' });
    
    // Check for transcript panel elements
    console.log('Looking for transcript segments');
    const hasTranscriptPanel = await page.evaluate(() => {
      // Look for common transcript elements
      const panelElements = document.querySelectorAll('ytd-engagement-panel-section-list-renderer');
      const transcriptElements = document.querySelectorAll('ytd-transcript-segment-renderer, div.segment');
      
      return {
        panelCount: panelElements.length,
        segmentCount: transcriptElements.length,
        foundTranscript: transcriptElements.length > 0
      };
    });
    
    console.log('Transcript panel check:', hasTranscriptPanel);
    
    if (!hasTranscriptPanel.foundTranscript) {
      console.log('Transcript segments not found via shortcut, trying button method');
      
      // Try clicking the "Show transcript" button if it exists
      const transcriptButtonClicked = await page.evaluate(() => {
        // Look for any button containing "transcript" text
        const buttons = Array.from(document.querySelectorAll('button'));
        for (const button of buttons) {
          if (button.textContent?.toLowerCase().includes('transcript')) {
            // Click the button
            button.click();
            return true;
          }
        }
        return false;
      });
      
      console.log(`Transcript button ${transcriptButtonClicked ? 'found and clicked' : 'not found'}`);
      
      // Wait for transcript to appear
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Take screenshot after button click
      await page.screenshot({ path: 'after-button-click.png' });
    }
    
    // Extract transcript data
    console.log('Attempting to extract transcript segments');
    const transcriptData = await page.evaluate(() => {
      const segments = Array.from(document.querySelectorAll('ytd-transcript-segment-renderer, div.segment'));
      console.log(`Found ${segments.length} possible transcript segments`);
      
      if (segments.length === 0) {
        // If no segments found, look for any elements that might contain transcript
        const panels = document.querySelectorAll('ytd-engagement-panel-section-list-renderer');
        if (panels.length > 0) {
          // Return HTML content of panels for debugging
          return Array.from(panels).map(panel => panel.innerHTML);
        }
        return [];
      }
      
      return segments.map(segment => {
        // Try to find timestamp and text from segment
        let timestamp = '';
        let text = '';
        
        // Look for timestamp element
        const timestampElement = segment.querySelector('[class*="timestamp"]') || 
                                segment.querySelector('div:first-child');
        if (timestampElement) {
          timestamp = timestampElement.textContent?.trim() || '';
        }
        
        // Look for text element
        const textElement = segment.querySelector('[class*="text"]') || 
                           segment.querySelector('yt-formatted-string') ||
                           segment;
        if (textElement) {
          text = textElement.textContent?.trim() || '';
        }
        
        return { timestamp, text };
      });
    });
    
    console.log(`Extraction completed, found ${Array.isArray(transcriptData) ? transcriptData.length : 0} items`);
    
    return transcriptData;
  } finally {
    // Make sure to close the browser
    await browser.close();
    console.log('Browser closed');
  }
}

// Main test function
async function runTest() {
  // "Me at the zoo" - First YouTube video ever
  const videoId = 'jNQXAC9IVRw';
  
  console.log('Starting simplified transcript extraction test');
  try {
    const data = await extractTranscript(videoId);
    console.log('Extraction result:', data);
    
    // Save data to file
    fs.writeFileSync('transcript-result.json', JSON.stringify(data, null, 2));
    console.log('Results saved to transcript-result.json');
    
    return data.length > 0;
  } catch (error: any) {
    console.error('Error during extraction:', error?.message || error);
    return false;
  }
}

// Run the test
runTest()
  .then(success => {
    console.log(`Test ${success ? 'PASSED ✅' : 'FAILED ❌'}`);
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error('Unexpected error:', error);
    process.exit(1);
  });