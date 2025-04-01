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
import { fileURLToPath } from 'url';
import { extractYoutubeId as extractId } from '../server/services/youtube';

// ES Module workaround for __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create logs directory if it doesn't exist
const logDir = path.join(__dirname, '../logs/transcript');
console.log(`Using log directory: ${logDir}`);
try {
  if (!fs.existsSync(logDir)) {
    console.log(`Creating log directory: ${logDir}`);
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
    : (/^[a-zA-Z0-9_-]{11}$/.test(videoId) ? videoId : null);
  
  if (!id) {
    logToFile(`Invalid YouTube URL or ID: ${videoId}`);
    throw new Error('Invalid YouTube URL or ID');
  }
  
  logToFile(`Starting Puppeteer transcript extraction for video: ${id}`);
  
  // Launch browser
  console.log('Launching Puppeteer browser...');
  const chromiumPath = '/nix/store/zi4f80l169xlmivz8vja8wlphq74qqk0-chromium-125.0.6422.141/bin/chromium-browser';
  console.log(`Using Chromium at: ${chromiumPath}`);
  
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    timeout: 20000, // Reduce timeout to 20 seconds
    executablePath: chromiumPath
  });
  console.log('Browser launched successfully');
  
  try {
    const page = await browser.newPage();
    
    // Set viewport
    await page.setViewport({ width: 1280, height: 800 });
    
    // Navigate to video
    const videoUrl = `https://www.youtube.com/watch?v=${id}`;
    logToFile(`Navigating to: ${videoUrl}`);
    console.log(`Navigating to YouTube video: ${videoUrl}`);
    await page.goto(videoUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
    console.log('Page navigation completed');
    
    // Wait for video player to load
    logToFile('Waiting for video player to load');
    console.log('Waiting for video player to load...');
    try {
      await page.waitForSelector('.html5-video-container', { timeout: 10000 });
      console.log('Video player loaded successfully');
    } catch (error: any) {
      console.log('Could not find video player, taking screenshot for debugging');
      await page.screenshot({ path: path.join(logDir, `player-not-found-${id}.png`) });
      throw new Error('Video player not found: ' + (error.message || 'Unknown error'));
    }
    
    // First try expanding the description (newer YouTube UI)
    logToFile('Looking for "...more" button in description');
    await page.screenshot({ path: path.join(logDir, `before-more-${id}.png`) });
    
    // Try to expand the description if needed
    try {
      // Look for the "...more" button in the description
      const expandButtonSelectors = [
        'tp-yt-paper-button#expand',
        'button#expand',
        'yt-formatted-string#expand',
        'span#expand'
      ];
      
      for (const selector of expandButtonSelectors) {
        const expandButton = await page.$(selector);
        if (expandButton) {
          logToFile(`Found expand button with selector: ${selector}`);
          await expandButton.click();
          logToFile('Clicked expand button');
          // Wait for description to expand
          await new Promise(resolve => setTimeout(resolve, 1000));
          break;
        }
      }
      
      // Take screenshot after expansion attempt
      await page.screenshot({ path: path.join(logDir, `after-more-${id}.png`) });
      
    } catch (error: any) {
      logToFile(`Error expanding description: ${error?.message || 'Unknown error'}`);
      // Continue anyway, the description might already be expanded
    }
    
    // Now look for the "Show transcript" button
    logToFile('Looking for "Show transcript" button');
    
    let transcriptButtonFound = false;
    
    // Try the new UI "Show transcript" button
    try {
      const transcriptButtonSelectors = [
        // Various possible selectors for the transcript button
        'ytd-button-renderer button[aria-label="Show transcript"]',
        'button[aria-label="Show transcript"]',
        'ytd-button-renderer:has(span:contains("Show transcript"))',
        'button:has(span:contains("Show transcript"))'
      ];
      
      // Use evaluate to find by text content since some selectors might not work directly
      const transcriptButtonsByText = await page.evaluate(() => {
        const allButtons = Array.from(document.querySelectorAll('button'));
        return allButtons
          .filter(button => {
            const text = button.textContent?.trim().toLowerCase();
            return text && text.includes('transcript');
          })
          .map(button => {
            return {
              text: button.textContent?.trim(),
              ariaLabel: button.getAttribute('aria-label')
            };
          });
      });
      
      logToFile(`Found buttons by text content: ${JSON.stringify(transcriptButtonsByText)}`);
      
      // Try clicking each selector
      for (const selector of transcriptButtonSelectors) {
        try {
          const buttons = await page.$$(selector);
          if (buttons.length > 0) {
            logToFile(`Found transcript button with selector: ${selector}`);
            await buttons[0].click();
            transcriptButtonFound = true;
            // Wait for transcript panel to appear
            await new Promise(resolve => setTimeout(resolve, 2000));
            break;
          }
        } catch (error: any) {
          logToFile(`Error with selector ${selector}: ${error?.message || 'Unknown error'}`);
        }
      }
      
      // If selectors didn't work, try another approach with evaluation
      if (!transcriptButtonFound) {
        logToFile('Trying to find and click transcript button by text content');
        
        // Click button by content
        const clickedByText = await page.evaluate(() => {
          const buttons = Array.from(document.querySelectorAll('button'));
          for (const button of buttons) {
            if (button.textContent?.toLowerCase().includes('transcript')) {
              // Cast to HTMLButtonElement to access click method
              (button as HTMLButtonElement).click();
              return true;
            }
          }
          return false;
        });
        
        if (clickedByText) {
          logToFile('Clicked transcript button by text content');
          transcriptButtonFound = true;
          // Wait for transcript panel to appear
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
    } catch (error: any) {
      logToFile(`Error finding transcript button: ${error?.message || 'Unknown error'}`);
    }
    
    // Check if we found the transcript button in the new UI
    if (!transcriptButtonFound) {
      // Fall back to the old UI method (settings menu)
      try {
        logToFile('Falling back to settings menu method');
        
        // Click settings gear icon
        const settingsButton = await page.$('button.ytp-button.ytp-settings-button');
        if (settingsButton) {
          logToFile('Found settings button');
          await settingsButton.click();
          // Wait for menu to appear
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          // Look for transcript option in menu
          const menuItems = await page.evaluate(() => {
            const items = document.querySelectorAll('.ytp-menuitem');
            return Array.from(items).map(item => ({
              text: item.textContent?.trim()
            }));
          });
          
          logToFile(`Menu items: ${JSON.stringify(menuItems)}`);
          
          // Click on transcript option if found
          const clickedTranscript = await page.evaluate(() => {
            const itemsList = document.querySelectorAll('.ytp-menuitem');
            // Manual iteration to avoid TypeScript NodeList iteration issues
            for (let i = 0; i < itemsList.length; i++) {
              const item = itemsList[i];
              if (item.textContent?.toLowerCase().includes('transcript')) {
                // Cast to HTMLElement to access click method
                (item as HTMLElement).click();
                return true;
              }
            }
            return false;
          });
          
          if (clickedTranscript) {
            logToFile('Clicked transcript option in settings menu');
            transcriptButtonFound = true;
            // Wait for transcript to appear
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
        }
      } catch (error: any) {
        logToFile(`Error with settings menu approach: ${error?.message || 'Unknown error'}`);
      }
    }
    
    // If all previous methods failed, try the keyboard shortcut
    if (!transcriptButtonFound) {
      logToFile('Trying keyboard shortcut for transcript');
      try {
        await page.keyboard.down('Control');
        await page.keyboard.press('KeyJ');
        await page.keyboard.up('Control');
        
        // Wait to see if transcript appears
        await new Promise(resolve => setTimeout(resolve, 2000));
        transcriptButtonFound = true;
      } catch (error: any) {
        logToFile(`Error with keyboard shortcut: ${error?.message || 'Unknown error'}`);
      }
    }
    
    // Take screenshot to verify transcript panel state
    await page.screenshot({ path: path.join(logDir, `transcript-panel-${id}.png`) });
    
    // Wait for transcript panel to load
    logToFile('Waiting for transcript panel to load');
    
    // Wait for transcript segments to appear using new YouTube UI structure
    const transcriptSelectors = [
      'ytd-transcript-segment-renderer', // New YouTube UI main segment element
      'div.segment.style-scope.ytd-transcript-segment-renderer', // Inner segment div
      'yt-formatted-string.segment-text', // Text element
      '.ytd-transcript-segment-renderer', // General selector
      '.transcript-segment' // Older structure
    ];
    
    let transcriptSelector = '';
    for (const selector of transcriptSelectors) {
      try {
        const hasSelector = await page.$(selector);
        if (hasSelector) {
          transcriptSelector = selector;
          logToFile(`Found transcript segments with selector: ${selector}`);
          break;
        }
      } catch (error: any) {
        logToFile(`Error checking selector ${selector}: ${error?.message || 'Unknown error'}`);
      }
    }
    
    if (!transcriptSelector) {
      logToFile('Could not find transcript segments with predefined selectors');
      
      // Check for engagement panel that contains transcript
      const hasEngagementPanel = await page.$('ytd-engagement-panel-section-list-renderer');
      if (hasEngagementPanel) {
        logToFile('Found engagement panel, checking for transcript content');
        
        // Take screenshot of the transcript panel
        await page.screenshot({ path: path.join(logDir, `transcript-panel-found-${id}.png`) });
        
        // Try to determine the selector from the engagement panel
        const panelContents = await page.evaluate(() => {
          const panel = document.querySelector('ytd-engagement-panel-section-list-renderer');
          if (panel) {
            // Check if it has transcript title
            const title = panel.querySelector('h2#title yt-formatted-string');
            const isTranscriptPanel = title && title.textContent?.includes('Transcript');
            
            if (isTranscriptPanel) {
              // Find segment containers
              // Convert NodeList to Array explicitly for TypeScript compatibility
              const elements = panel.querySelectorAll('*');
              const segmentRenderers = [];
              
              // Manually iterate over NodeList to avoid TypeScript issues
              for (let i = 0; i < elements.length; i++) {
                const el = elements[i];
                if (el.tagName.toLowerCase().includes('segment') || 
                    (typeof el.className === 'string' && el.className.includes('segment'))) {
                  segmentRenderers.push(el);
                }
              }
              
              // Map elements to selector strings
              const possibleSelectors = segmentRenderers.map(el => {
                const tagName = el.tagName.toLowerCase();
                const id = el.id ? `#${el.id}` : '';
                const className = typeof el.className === 'string' && el.className ? 
                  `.${el.className.split(' ').join('.')}` : '';
                return `${tagName}${id}${className}`;
              }).filter(Boolean);
              
              return {
                isTranscriptPanel: true,
                possibleSelectors
              };
            }
          }
          return { isTranscriptPanel: false, possibleSelectors: [] };
        });
        
        logToFile(`Panel contents: ${JSON.stringify(panelContents)}`);
        
        if (panelContents.isTranscriptPanel && panelContents.possibleSelectors.length > 0) {
          transcriptSelector = panelContents.possibleSelectors[0];
          logToFile(`Using dynamically discovered selector: ${transcriptSelector}`);
        }
      }
      
      // If still no selector, try final approaches
      if (!transcriptSelector) {
        // Take a screenshot to debug
        await page.screenshot({ path: path.join(logDir, `final-state-${id}.png`) });
        
        // Grab page content for debugging
        const pageContent = await page.content();
        fs.writeFileSync(path.join(logDir, `page-content-${id}.html`), pageContent);
        
        throw new Error('Transcript segments not found or not available for this video');
      }
    }
    
    // Extract transcript segments
    logToFile(`Extracting transcript segments using selector: ${transcriptSelector}`);
    
    // Wait for all segments to fully load
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Extract transcript segments with updated approach for new YouTube UI
    const transcriptData = await page.evaluate(() => {
      // Find all transcript segments regardless of exact structure
      // This is more resilient to YouTube UI changes
      // Convert NodeList to Array explicitly to avoid iteration issues
      const segments = Array.from(document.querySelectorAll('ytd-transcript-segment-renderer, div.segment'));
      
      return segments.map(segment => {
        // Find timestamp - look for common patterns in YouTube's transcript UI
        let timestampElement = 
          segment.querySelector('.segment-timestamp') || // Standard class
          segment.querySelector('div[class*="timestamp"]') || // Any element with timestamp in class
          segment.querySelector('div:first-child div') || // First child div (often contains timestamp)
          segment.querySelector('[start-time]'); // Element with start-time attribute
        
        // Find text element - various ways YouTube might structure it
        let textElement = 
          segment.querySelector('.segment-text') || 
          segment.querySelector('yt-formatted-string') ||
          segment.querySelector('span:not([class*="timestamp"])') || // Any non-timestamp span
          segment;
        
        // Extract timestamp text
        let timestamp = '';
        if (timestampElement) {
          timestamp = timestampElement.textContent?.trim() || '';
        }
        
        // Extract text content
        let text = '';
        if (textElement) {
          text = textElement.textContent?.trim() || '';
        }
        
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
        
        return {
          text: text || '',
          startTime: timestamp || '',
          startSeconds: startSeconds
        };
      });
    });
    
    logToFile(`Extracted ${transcriptData.length} transcript segments`);
    
    // Save full transcript data for debugging
    fs.writeFileSync(
      path.join(logDir, `transcript-data-${id}.json`), 
      JSON.stringify(transcriptData, null, 2)
    );
    
    return transcriptData;
    
  } catch (error: any) {
    logToFile(`Error in Puppeteer transcript extraction: ${error?.message || 'Unknown error'}`);
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
  } catch (error: any) {
    console.error('Error:', error?.message || 'Unknown error');
  }
}

// When script is run directly, call testExtraction with commandline arg or default
if (process.argv[1].includes('puppeteer-transcript.ts')) {
  const videoId = process.argv[2] || 'SS5DYx6mPw8';
  console.log('Running as standalone script');
  testExtraction(videoId)
    .then(() => console.log('Test complete'))
    .catch(err => console.error('Test failed:', err));
}