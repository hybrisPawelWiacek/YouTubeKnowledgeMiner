/**
 * Test script to check which method in our YouTube service works for a given video
 */
import { getYoutubeTranscript, extractYoutubeId } from './server/services/youtube';
import * as fs from 'fs';
import path from 'path';

// Create logs directory if it doesn't exist
const logDir = './logs/transcript';
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

async function testYoutubeService(videoUrl: string) {
  console.log(`\n🔍 TESTING YOUTUBE SERVICE FOR: ${videoUrl}\n`);
  
  // Extract the YouTube ID
  const videoId = extractYoutubeId(videoUrl);
  if (!videoId) {
    console.error('❌ Invalid YouTube URL or ID provided');
    return;
  }
  
  console.log(`📋 Extracted video ID: ${videoId}`);
  
  try {
    // Backup original console.log to capture logs
    const originalConsoleLog = console.log;
    const originalConsoleInfo = console.info;
    const originalConsoleError = console.error;
    
    let capturedLogs: string[] = [];
    
    // Override console methods to capture logs
    console.log = function(...args) {
      capturedLogs.push(args.join(' '));
      originalConsoleLog.apply(console, args);
    };
    
    console.info = function(...args) {
      capturedLogs.push('INFO: ' + args.join(' '));
      originalConsoleInfo.apply(console, args);
    };
    
    console.error = function(...args) {
      capturedLogs.push('ERROR: ' + args.join(' '));
      originalConsoleError.apply(console, args);
    };
    
    console.log('🔄 Calling getYoutubeTranscript...');
    const startTime = Date.now();
    
    // Set a timeout for the operation
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Operation timed out after 60 seconds')), 60000);
    });
    
    const transcriptPromise = getYoutubeTranscript(videoId);
    
    // Race between the extraction and the timeout
    const transcript = await Promise.race([
      transcriptPromise,
      timeoutPromise
    ]) as string;
    
    const endTime = Date.now();
    const timeSeconds = ((endTime - startTime) / 1000).toFixed(2);
    
    // Restore original console methods
    console.log = originalConsoleLog;
    console.info = originalConsoleInfo;
    console.error = originalConsoleError;
    
    // Determine which method succeeded by analyzing the logs
    let successMethod = 'Unknown';
    
    if (capturedLogs.some(log => log.includes('Successfully retrieved transcript with legacy method'))) {
      successMethod = 'Method 1 (Legacy)';
    } else if (capturedLogs.some(log => log.includes('Successfully retrieved transcript with API'))) {
      successMethod = 'Method 2 (API)';
    } else if (capturedLogs.some(log => log.includes('Successfully extracted') && log.includes('transcript segments with Puppeteer'))) {
      successMethod = 'Method 3 (Puppeteer)';
    } else if (capturedLogs.some(log => log.includes('Using direct extraction method with Apify token'))) {
      successMethod = 'Method 4 (Apify)';
    }
    
    if (!transcript) {
      console.error('❌ No transcript returned from any method');
      return;
    }
    
    console.log(`✅ SUCCESS! Transcript obtained in ${timeSeconds}s`);
    console.log(`🏆 Method that succeeded: ${successMethod}`);
    
    // Save transcript to file
    const outputFile = path.join(logDir, `transcript-${videoId}.html`);
    fs.writeFileSync(outputFile, transcript);
    console.log(`💾 Saved transcript to: ${outputFile}`);
    
    // Get a sample of the transcript (first 500 characters)
    const sample = transcript.substring(0, 500) + '... [truncated]';
    
    console.log('\n📝 TRANSCRIPT SAMPLE:');
    console.log('-------------------');
    console.log(sample);
    
    return successMethod;
    
  } catch (error) {
    console.error('❌ Error testing YouTube service:', error);
    return null;
  }
}

// Run the test with the provided YouTube URL
const videoUrl = 'https://youtu.be/dQw4w9WgXcQ'; // Rick Astley - Never Gonna Give You Up
testYoutubeService(videoUrl);