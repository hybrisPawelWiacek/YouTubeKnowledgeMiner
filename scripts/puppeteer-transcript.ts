/**
 * YouTube Transcript Extraction using Puppeteer
 * 
 * This script uses browser automation to:
 * 1. Load a YouTube video page
 * 2. Open the transcript panel
 * 3. Extract transcript text with timestamps
 */

import puppeteer from 'puppeteer';
import * as fs from 'fs';
import path from 'path';
import { extractYoutubeId as extractId } from '../server/services/youtube';

// Create logs directory if it doesn't exist
const logDir = './logs/transcript';
try {
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
} catch (error) {
  console.error('Error creating log directory:', error);
}

// Helper function to log to file
function logToFile(message: string) {
  try {
    fs.appendFileSync(
      path.join(logDir, 'puppeteer-transcript.log'), 
      `${new Date().toISOString()} - ${message}\n`
    );
  } catch (error) {
    console.error('Error writing to log file:', error);
  }
}

interface TranscriptSegment {
  text: string;
  startTime: string;
  startSeconds: number;
}

/**
 * Extract transcript using Puppeteer
 */
export async function extractYoutubeTranscript(videoId: string): Promise<TranscriptSegment[] | null> {
  // Normalize video ID (handle URLs vs IDs)
  const id = videoId.includes('youtube.com') || videoId.includes('youtu.be') 
    ? extractId(videoId) 
    : videoId;
  
  if (!id) {
    logToFile(`Invalid YouTube URL or ID: ${videoId}`);
    throw new Error('Invalid YouTube URL or ID');
  }
  
  logToFile(`Starting Puppeteer transcript extraction for video: ${id}`);
  
  // Launch browser
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  try {
    const page = await browser.newPage();
    
    // Set viewport
    await page.setViewport({ width: 1280, height: 800 });
    
    // Navigate to video
    const videoUrl = `https://www.youtube.com/watch?v=${id}`;
    logToFile(`Navigating to: ${videoUrl}`);
    await page.goto(videoUrl, { waitUntil: 'networkidle2', timeout: 30000 });
    
    // Wait for video player to load
    logToFile('Waiting for video player to load');
    await page.waitForSelector('.html5-video-container', { timeout: 10000 });
    
    // Click on "..." button to open menu
    logToFile('Looking for More actions button');
    
    // Need to try different selectors as YouTube's UI can vary
    const moreButtonSelectors = [
      'button.ytp-button.ytp-settings-button', // Settings gear icon
      'button[aria-label="More actions"]',
      '.ytp-right-controls button.ytp-button:nth-child(5)'
    ];
    
    let moreButtonFound = false;
    for (const selector of moreButtonSelectors) {
      try {
        if (await page.$(selector)) {
          logToFile(`Found more actions button with selector: ${selector}`);
          await page.click(selector);
          moreButtonFound = true;
          // Wait for menu to appear
          await new Promise(resolve => setTimeout(resolve, 1000));
          break;
        }
      } catch (error) {
        logToFile(`Error clicking selector ${selector}: ${error}`);
      }
    }
    
    if (!moreButtonFound) {
      logToFile('Could not find More actions button');
      throw new Error('Could not find More actions button');
    }
    
    // Look for "Show transcript" or "Open transcript" option
    logToFile('Looking for transcript option in menu');
    
    // Save screenshot for debugging
    await page.screenshot({ path: path.join(logDir, `menu-${id}.png`) });
    
    // Get all menu items text
    const menuItems = await page.evaluate(() => {
      const items = document.querySelectorAll('.ytp-menuitem, .ytp-panel-menu .ytp-menuitem');
      return Array.from(items).map(item => {
        return {
          text: item.textContent?.trim(),
          ariaLabel: item.getAttribute('aria-label')
        };
      });
    });
    
    logToFile(`Menu items found: ${JSON.stringify(menuItems)}`);
    
    // Click on "Show transcript" option if found
    let transcriptOptionFound = false;
    
    // First try clicking through the settings menu to find transcript
    try {
      // Need to find and click on the transcript option
      // Various selector attempts since YouTube may change its UI
      const transcriptSelectors = [
        // Direct transcript button
        'button[aria-label="Show transcript"], button[aria-label="Open transcript"]',
        
        // Try to find by text content containing "transcript"
        '.ytp-menuitem:nth-child(4)', // Often the 4th item in newer YouTube UI
        '.ytp-panel-menu button.ytp-menuitem'
      ];
      
      for (const selector of transcriptSelectors) {
        const elements = await page.$$(selector);
        
        if (elements.length > 0) {
          // Check each element
          for (const element of elements) {
            const text = await page.evaluate(el => el.textContent, element);
            logToFile(`Found menu item: ${text}`);
            
            if (text && text.toLowerCase().includes('transcript')) {
              logToFile(`Found transcript option: ${text}`);
              await element.click();
              transcriptOptionFound = true;
              break;
            }
          }
          
          if (transcriptOptionFound) break;
        }
      }
    } catch (error) {
      logToFile(`Error finding transcript option: ${error}`);
    }
    
    if (!transcriptOptionFound) {
      // Plan B: Toggle transcript with keyboard shortcut
      logToFile('Trying keyboard shortcut to open transcript');
      await page.keyboard.down('Control');
      await page.keyboard.press('KeyJ');
      await page.keyboard.up('Control');
      
      // Wait to see if transcript appears
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Take screenshot to check if transcript panel appeared
      await page.screenshot({ path: path.join(logDir, `transcript-panel-${id}.png`) });
    }
    
    // Wait for transcript panel to load
    logToFile('Waiting for transcript panel to load');
    
    // Wait for transcript segments to appear
    const transcriptSelectors = [
      'ytd-transcript-segment-renderer',
      'yt-formatted-string.segment-text',
      '.ytd-transcript-segment-renderer',
      '.transcript-segment'
    ];
    
    let transcriptSelector = '';
    for (const selector of transcriptSelectors) {
      if (await page.$(selector)) {
        transcriptSelector = selector;
        logToFile(`Found transcript segments with selector: ${selector}`);
        break;
      }
    }
    
    if (!transcriptSelector) {
      logToFile('Could not find transcript segments in the page');
      
      // Last attempt: Check if transcript is in a different part of the UI
      // Take a screenshot to debug
      await page.screenshot({ path: path.join(logDir, `final-state-${id}.png`) });
      
      // Search entire page for anything containing transcript-related elements
      const pageContent = await page.content();
      fs.writeFileSync(path.join(logDir, `page-content-${id}.html`), pageContent);
      
      throw new Error('Transcript not found or not available for this video');
    }
    
    // Extract transcript segments
    logToFile('Extracting transcript segments');
    
    // Wait a moment for all transcript segments to load
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Extract transcript segments
    const transcriptData = await page.evaluate((selector) => {
      const segments = document.querySelectorAll(selector);
      return Array.from(segments).map(segment => {
        // Try to find timestamp and text based on different possible structures
        let timestampElement = segment.querySelector('.segment-timestamp') || 
                               segment.querySelector('span[start-time]') ||
                               segment.querySelector('.ytd-transcript-segment-renderer span');
        
        let textElement = segment.querySelector('.segment-text') || 
                          segment.querySelector('yt-formatted-string') ||
                          segment;
        
        // Get the timestamp
        let timestamp = timestampElement ? timestampElement.textContent?.trim() : '';
        
        // Convert timestamp to seconds
        let startSeconds = 0;
        if (timestamp) {
          const parts = timestamp.split(':');
          if (parts.length === 2) {
            // MM:SS format
            startSeconds = parseInt(parts[0]) * 60 + parseFloat(parts[1]);
          } else if (parts.length === 3) {
            // HH:MM:SS format
            startSeconds = parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseFloat(parts[2]);
          }
        }
        
        // Get the text
        let text = textElement ? textElement.textContent?.trim() : '';
        
        return {
          text: text || '',
          startTime: timestamp || '',
          startSeconds: startSeconds
        };
      });
    }, transcriptSelector);
    
    logToFile(`Extracted ${transcriptData.length} transcript segments`);
    
    // Save full transcript data for debugging
    fs.writeFileSync(
      path.join(logDir, `transcript-data-${id}.json`), 
      JSON.stringify(transcriptData, null, 2)
    );
    
    return transcriptData;
    
  } catch (error) {
    logToFile(`Error in Puppeteer transcript extraction: ${error}`);
    throw error;
  } finally {
    // Close browser
    await browser.close();
    logToFile('Browser closed');
  }
}

// Using the renamed extractId function imported from youtube.ts

// Export standalone test function for command line testing
export async function testExtraction(videoId: string = 'SS5DYx6mPw8') {
  console.log(`Testing transcript extraction for video: ${videoId}`);
  
  try {
    const transcript = await extractYoutubeTranscript(videoId);
    if (transcript && transcript.length > 0) {
      console.log(`Successfully extracted ${transcript.length} transcript segments`);
      console.log('First few segments:');
      transcript.slice(0, 5).forEach(segment => {
        console.log(`[${segment.startTime}] ${segment.text}`);
      });
    } else {
      console.log('No transcript segments extracted');
    }
  } catch (error) {
    console.error('Error:', error);
  }
}