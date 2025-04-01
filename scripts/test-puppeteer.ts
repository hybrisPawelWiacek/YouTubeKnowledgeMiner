/**
 * Test script for puppeteer transcript extraction
 * This script tests the puppeteer-based transcript extraction
 * from YouTube videos
 */

import { extractYoutubeTranscript } from './puppeteer-transcript';
import { extractYoutubeId } from '../server/services/youtube';
import * as fs from 'fs';
import * as path from 'path';

// Function to write transcript to file
function saveTranscriptToFile(videoId: string, transcript: any) {
  const logsDir = path.join(__dirname, '../logs/transcript');
  
  // Create directory if it doesn't exist
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }
  
  const timestamp = new Date().toISOString().replace(/:/g, '-');
  const filename = path.join(logsDir, `transcript-puppeteer-${videoId}-${timestamp}.json`);
  
  fs.writeFileSync(filename, JSON.stringify(transcript, null, 2));
  console.log(`Transcript saved to ${filename}`);
}

// Test function to run the transcript extraction
async function testPuppeteerTranscript(urlOrId: string) {
  console.log(`=== Testing Puppeteer Transcript Extraction ===`);
  console.log(`Input: ${urlOrId}`);
  
  // Extract YouTube ID from input
  const videoId = extractYoutubeId(urlOrId);
  
  if (!videoId) {
    console.error(`Error: Invalid YouTube URL or ID: ${urlOrId}`);
    process.exit(1);
  }
  
  console.log(`Extracted YouTube ID: ${videoId}`);
  console.log(`Fetching transcript for video ID: ${videoId}...`);
  
  // Set a global timeout for the entire operation
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => {
      reject(new Error('Transcript extraction timed out after 60 seconds'));
    }, 60000); // 60 seconds timeout
  });
  
  try {
    // Race the extraction against the timeout
    const transcript = await Promise.race([
      extractYoutubeTranscript(videoId),
      timeoutPromise
    ]) as any;
    
    if (transcript && transcript.length > 0) {
      console.log(`Success! Transcript extracted with ${transcript.length} segments.`);
      console.log(`First 3 segments:`);
      
      // Log the first 3 segments of the transcript (or fewer if less than 3)
      const sampleSize = Math.min(transcript.length, 3);
      for (let i = 0; i < sampleSize; i++) {
        console.log(`[${transcript[i].startTime}] ${transcript[i].text}`);
      }
      
      // Save the transcript to a file
      saveTranscriptToFile(videoId, transcript);
    } else {
      console.log(`No transcript found or transcript is empty.`);
    }
  } catch (error) {
    console.error(`Error extracting transcript:`, error);
    // Check logs directory for detailed logs
    const logsDir = path.join(__dirname, '../logs/transcript');
    console.log(`Check logs directory for detailed information: ${logsDir}`);
  }
}

// Run the test with the provided YouTube URL or ID
// Default to a known TED talk with subtitles if no argument is provided
const defaultVideo = 'https://www.youtube.com/watch?v=8S0FDjFBj8o'; // TED talk with captions
const videoUrl = process.argv[2] || defaultVideo;

testPuppeteerTranscript(videoUrl)
  .then(() => console.log('Transcript extraction test completed.'))
  .catch(error => console.error('Test failed with error:', error))
  .finally(() => process.exit(0));