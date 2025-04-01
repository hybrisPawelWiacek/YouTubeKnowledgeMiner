/**
 * Test script for our updated YouTube transcript extractor
 * This script will test transcript extraction on various YouTube videos
 * to ensure our updated code works with YouTube's new UI.
 */

import { extractYoutubeTranscript } from './scripts/puppeteer-transcript';
import * as fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// ES Module workaround for __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create results directory
const resultsDir = path.join(__dirname, 'test-results');
if (!fs.existsSync(resultsDir)) {
  fs.mkdirSync(resultsDir, { recursive: true });
}

// List of test videos with different characteristics
// Include videos known to have transcripts
const testVideos = [
  // Well-known video that should have auto-generated transcript
  { id: 'dQw4w9WgXcQ', description: 'Rick Astley - Never Gonna Give You Up' },
  
  // Testing only one video for now to keep the test faster
  // Uncomment the below line for additional testing if needed
  // { id: 'QH2-TGUlwu4', description: 'Nyan Cat' },
];

/**
 * Run the test for a single video
 */
async function testVideo(videoId: string, description: string): Promise<boolean> {
  console.log(`\n=== Testing transcript extraction for: ${description} ===`);
  console.log(`Video ID: ${videoId}`);
  
  try {
    // Set a timeout of 60 seconds for the entire extraction process
    const timeoutPromise = new Promise<null>((_, reject) => {
      setTimeout(() => reject(new Error('Test timed out after 60 seconds')), 60000);
    });
    
    // Run extraction with timeout
    console.time('Extraction time');
    const transcript = await Promise.race([
      extractYoutubeTranscript(videoId),
      timeoutPromise
    ]) as any;
    console.timeEnd('Extraction time');
    
    if (!transcript || transcript.length === 0) {
      console.log('❌ No transcript segments found');
      return false;
    }
    
    console.log(`✅ Successfully extracted ${transcript.length} transcript segments`);
    console.log('First few segments:');
    transcript.slice(0, 3).forEach(segment => {
      console.log(`[${segment.startTime}] ${segment.text}`);
    });
    
    // Save results to file
    const resultsFile = path.join(resultsDir, `transcript-${videoId}.json`);
    fs.writeFileSync(resultsFile, JSON.stringify(transcript, null, 2));
    console.log(`Full transcript saved to: ${resultsFile}`);
    
    return true;
  } catch (error: any) {
    console.log(`❌ Error extracting transcript: ${error?.message || 'Unknown error'}`);
    return false;
  }
}

/**
 * Run the test suite
 */
async function runTests() {
  console.log('=== Starting YouTube Transcript Extractor Test Suite ===');
  console.log(`Testing ${testVideos.length} videos`);
  
  let successCount = 0;
  
  for (const video of testVideos) {
    const success = await testVideo(video.id, video.description);
    if (success) successCount++;
  }
  
  console.log('\n=== Test Suite Summary ===');
  console.log(`Tests completed: ${testVideos.length}`);
  console.log(`Successful: ${successCount}`);
  console.log(`Failed: ${testVideos.length - successCount}`);
  
  return successCount === testVideos.length;
}

// Run the tests
runTests()
  .then(success => {
    console.log(`\nTest suite ${success ? 'PASSED ✅' : 'FAILED ❌'}`);
    process.exit(success ? 0 : 1);
  })
  .catch(err => {
    console.error('Error running test suite:', err);
    process.exit(1);
  });