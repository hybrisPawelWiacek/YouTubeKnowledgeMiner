/**
 * A simplified test script focusing only on the YouTube Transcript API method
 */
import { extractYoutubeId } from './server/services/youtube';
import * as fs from 'fs';
import * as child_process from 'child_process';
import path from 'path';

// Create logs directory if it doesn't exist
const logDir = './logs/transcript';
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

async function testTranscriptApi(videoUrl: string) {
  console.log(`\n🔍 TESTING YOUTUBE TRANSCRIPT API METHOD FOR: ${videoUrl}\n`);
  
  // Extract the YouTube ID
  const videoId = extractYoutubeId(videoUrl);
  if (!videoId) {
    console.error('❌ Invalid YouTube URL or ID provided');
    return;
  }
  
  console.log(`📋 Extracted video ID: ${videoId}`);
  
  try {
    // Use Node.js child_process to run our CommonJS helper script
    const nodeCommand = `node scripts/get-transcript.cjs ${videoId}`;
    console.log(`🔄 Running command: ${nodeCommand}`);
    
    const startTime = Date.now();
    
    // Execute the command and get the output
    const output = child_process.execSync(nodeCommand, {
      encoding: 'utf-8',
      timeout: 15000, // 15-second timeout
      maxBuffer: 1024 * 1024 // 1MB buffer
    });
    
    const endTime = Date.now();
    const timeSeconds = ((endTime - startTime) / 1000).toFixed(2);
    
    console.log(`✅ Command executed successfully in ${timeSeconds}s`);
    
    // Parse the output as JSON to get the transcript items
    console.log('🔍 Parsing JSON output...');
    const result = JSON.parse(output);
    
    if (result === null) {
      console.error('❌ Helper script returned null result');
      return false;
    }
    
    // An empty array means the transcript was attempted but failed
    if (Array.isArray(result) && result.length === 0) {
      console.error('❌ Helper script returned empty array - transcript unavailable');
      return false;
    }
    
    console.log(`✅ Successfully retrieved transcript with ${result.length} items`);
    
    // Save transcript to file
    const outputPath = path.join(logDir, `api-transcript-${videoId}.json`);
    fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));
    console.log(`💾 Saved transcript to: ${outputPath}`);
    
    // Display sample of transcript
    console.log('\n📝 TRANSCRIPT SAMPLE:');
    console.log('-------------------');
    
    const sampleSize = Math.min(5, result.length);
    for (let i = 0; i < sampleSize; i++) {
      const segment = result[i];
      const minutes = Math.floor(segment.start / 60);
      const seconds = Math.floor(segment.start % 60);
      const startTime = `${minutes}:${seconds.toString().padStart(2, '0')}`;
      
      console.log(`[${startTime}] ${segment.text}`);
    }
    
    if (result.length > sampleSize) {
      console.log(`... and ${result.length - sampleSize} more segments`);
    }
    
    return true;
    
  } catch (apiError) {
    console.error('❌ Error in API method:', apiError);
    return false;
  }
}

// Run the test with the provided YouTube URL
const videoUrl = 'https://youtu.be/BvCOZrqGyNU?si=mcQYgsigwY2xfDr1';
testTranscriptApi(videoUrl);