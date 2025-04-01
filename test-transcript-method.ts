/**
 * Test script to identify which transcript extraction method successfully works
 * This script will run each method in sequence and report the results
 */
import { extractYoutubeId } from './server/services/youtube';
import * as fs from 'fs';
import * as child_process from 'child_process';
import axios from 'axios';
import { createLogger } from './server/services/logger';
import { fetchTranscriptWithApify } from './server/services/apify-transcript';
import { extractYoutubeTranscript as puppeteerExtractTranscript } from './scripts/puppeteer-transcript';
import path from 'path';

// Create a logger for this test
const testLogger = createLogger('transcript-test');

// Create logs directory if it doesn't exist
const logDir = './logs/transcript';
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// Wrapper function to test the legacy method
async function testLegacyMethod(videoId: string): Promise<boolean> {
  testLogger.info(`Testing legacy method for video ID: ${videoId}`);
  
  try {
    // Direct fetch approach using the YouTube transcript endpoint
    testLogger.info(`Fetching YouTube page for video: ${videoId}`);
    const response = await axios.get(`https://www.youtube.com/watch?v=${videoId}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    
    const html = response.data;
    
    // Look for the captionTracks data in the script content
    const captionRegex = /"captionTracks":\s*(\[.*?\])/;
    const match = html.match(captionRegex);
    
    if (!match || !match[1]) {
      testLogger.error(`Legacy method: No caption tracks found in script content`);
      return false;
    }
    
    testLogger.info(`Legacy method: Found captionTracks pattern`);
    
    // Parse the JSON data
    const captionTracksJson = match[1].replace(/\\"/g, '"').replace(/\\u0026/g, '&');
    
    try {
      const captionTracks = JSON.parse(captionTracksJson);
      
      if (captionTracks.length === 0) {
        testLogger.error(`Legacy method: Caption tracks array is empty`);
        return false;
      }
      
      testLogger.info(`Legacy method: Found ${captionTracks.length} caption tracks`);
      
      // Get the first available track (preferably English)
      let selectedTrack = captionTracks.find((track: any) => 
        track.languageCode === 'en' || track.language === 'English'
      );
      
      // If no English track, just use the first one
      if (!selectedTrack) {
        selectedTrack = captionTracks[0];
      }
      
      if (!selectedTrack || !selectedTrack.baseUrl) {
        testLogger.error(`Legacy method: Selected track has no baseUrl`);
        return false;
      }
      
      // We've found a valid transcript URL, consider this a success
      testLogger.info(`Legacy method: Successfully found transcript baseUrl`);
      return true;
      
    } catch (parseError) {
      testLogger.error(`Legacy method: Error parsing caption tracks JSON: ${parseError}`);
      return false;
    }
    
  } catch (error) {
    testLogger.error(`Legacy method: Error: ${error}`);
    return false;
  }
}

// Wrapper function to test the YouTube transcript API method
async function testTranscriptApi(videoId: string): Promise<boolean> {
  testLogger.info(`Testing youtube-transcript-api method for video ID: ${videoId}`);
  
  try {
    // Use Node.js child_process to run our CommonJS helper script
    const nodeCommand = `node scripts/get-transcript.cjs ${videoId}`;
    testLogger.info(`Command: ${nodeCommand}`);
    
    // Execute the command and get the output
    const output = child_process.execSync(nodeCommand, {
      encoding: 'utf-8',
      timeout: 15000, // 15-second timeout
      maxBuffer: 1024 * 1024 // 1MB buffer
    });
    
    // Parse the output as JSON to get the transcript items
    const result = JSON.parse(output);
    
    if (result === null) {
      testLogger.error(`API method: Helper script returned null result`);
      return false;
    }
    
    // An empty array means the transcript was attempted but failed
    if (Array.isArray(result) && result.length === 0) {
      testLogger.error(`API method: Helper script returned empty array - transcript unavailable`);
      return false;
    }
    
    testLogger.info(`API method: Successfully retrieved transcript with ${result.length} items`);
    return true;
    
  } catch (apiError) {
    testLogger.error(`API method: Error: ${apiError}`);
    return false;
  }
}

// Wrapper function to test the Puppeteer method
async function testPuppeteerMethod(videoId: string): Promise<boolean> {
  testLogger.info(`Testing Puppeteer method for video ID: ${videoId}`);
  
  try {
    // Use the Puppeteer-based extraction function
    const transcriptSegments = await puppeteerExtractTranscript(videoId);
    
    if (!transcriptSegments || transcriptSegments.length === 0) {
      testLogger.error(`Puppeteer method: No transcript segments returned`);
      return false;
    }
    
    testLogger.info(`Puppeteer method: Successfully extracted ${transcriptSegments.length} segments`);
    return true;
    
  } catch (error) {
    testLogger.error(`Puppeteer method: Error: ${error}`);
    return false;
  }
}

// Wrapper function to test the Apify method
async function testApifyMethod(videoId: string): Promise<boolean> {
  testLogger.info(`Testing Apify method for video ID: ${videoId}`);
  
  try {
    // Get the Apify API token from environment variables
    const apiToken = process.env.APIFY_API_TOKEN;
    if (!apiToken) {
      testLogger.error(`Apify method: No Apify API token available in environment variables`);
      return false;
    }
    
    // Call the Apify service
    const transcriptSegments = await fetchTranscriptWithApify(videoId, apiToken);
    
    if (!transcriptSegments || transcriptSegments.length === 0) {
      testLogger.error(`Apify method: No transcript segments returned`);
      return false;
    }
    
    testLogger.info(`Apify method: Successfully extracted ${transcriptSegments.length} segments`);
    return true;
    
  } catch (error) {
    testLogger.error(`Apify method: Error: ${error}`);
    return false;
  }
}

// Main function to test all methods
async function testAllTranscriptMethods(videoUrl: string) {
  console.log(`\n🔍 TESTING TRANSCRIPT EXTRACTION FOR: ${videoUrl}\n`);
  
  // Extract the YouTube ID
  const videoId = extractYoutubeId(videoUrl);
  if (!videoId) {
    console.error('❌ Invalid YouTube URL or ID provided');
    return;
  }
  
  console.log(`📋 Extracted video ID: ${videoId}`);
  console.log(`\n🧪 Testing all transcript extraction methods in sequence:\n`);
  
  // Method 1: Legacy method
  console.log('🔄 Testing Method 1: Legacy extraction...');
  const legacyResult = await testLegacyMethod(videoId);
  console.log(legacyResult 
    ? '✅ Method 1 (Legacy): SUCCESS - Transcript found!' 
    : '❌ Method 1 (Legacy): FAILED - No transcript available using this method');
  
  // Method 2: YouTube Transcript API
  console.log('\n🔄 Testing Method 2: youtube-transcript-api...');
  const apiResult = await testTranscriptApi(videoId);
  console.log(apiResult 
    ? '✅ Method 2 (API): SUCCESS - Transcript found!' 
    : '❌ Method 2 (API): FAILED - No transcript available using this method');
  
  // Method 3: Puppeteer
  console.log('\n🔄 Testing Method 3: Puppeteer extraction...');
  const puppeteerResult = await testPuppeteerMethod(videoId);
  console.log(puppeteerResult 
    ? '✅ Method 3 (Puppeteer): SUCCESS - Transcript found!' 
    : '❌ Method 3 (Puppeteer): FAILED - No transcript available using this method');
  
  // Method 4: Apify
  console.log('\n🔄 Testing Method 4: Apify extraction...');
  const apifyResult = await testApifyMethod(videoId);
  console.log(apifyResult 
    ? '✅ Method 4 (Apify): SUCCESS - Transcript found!' 
    : '❌ Method 4 (Apify): FAILED - No transcript available using this method');
  
  // Summary
  console.log('\n📊 SUMMARY OF RESULTS:');
  console.log('---------------------');
  console.log(`Method 1 (Legacy):    ${legacyResult ? '✅ SUCCESS' : '❌ FAILED'}`);
  console.log(`Method 2 (API):       ${apiResult ? '✅ SUCCESS' : '❌ FAILED'}`);
  console.log(`Method 3 (Puppeteer): ${puppeteerResult ? '✅ SUCCESS' : '❌ FAILED'}`);
  console.log(`Method 4 (Apify):     ${apifyResult ? '✅ SUCCESS' : '❌ FAILED'}`);
  
  // Determine first working method
  let firstWorkingMethod = 'None';
  if (legacyResult) firstWorkingMethod = 'Method 1 (Legacy)';
  else if (apiResult) firstWorkingMethod = 'Method 2 (API)';
  else if (puppeteerResult) firstWorkingMethod = 'Method 3 (Puppeteer)';
  else if (apifyResult) firstWorkingMethod = 'Method 4 (Apify)';
  
  console.log(`\n🏆 First successful method: ${firstWorkingMethod}`);
  
  if (firstWorkingMethod === 'None') {
    console.log('\n❌ ALL METHODS FAILED: Could not extract transcript for this video');
  }
}

// Run the test with the provided YouTube URL
const videoUrl = 'https://youtu.be/BvCOZrqGyNU?si=mcQYgsigwY2xfDr1';
testAllTranscriptMethods(videoUrl);