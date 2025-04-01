/**
 * A simplified test script focusing only on the Apify method
 */
import { extractYoutubeId } from './server/services/youtube';
import { fetchTranscriptWithApify } from './server/services/apify-transcript';
import * as fs from 'fs';
import path from 'path';

// Create logs directory if it doesn't exist
const logDir = './logs/transcript';
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

async function testApifyMethod(videoUrl: string) {
  console.log(`\n🔍 TESTING APIFY METHOD FOR: ${videoUrl}\n`);
  
  // Extract the YouTube ID
  const videoId = extractYoutubeId(videoUrl);
  if (!videoId) {
    console.error('❌ Invalid YouTube URL or ID provided');
    return;
  }
  
  console.log(`📋 Extracted video ID: ${videoId}`);
  
  try {
    // Get the Apify API token from environment variables
    const apiToken = process.env.APIFY_API_TOKEN;
    if (!apiToken) {
      console.error('❌ No Apify API token available in environment variables');
      return;
    }
    
    console.log('🔑 Found Apify API token, proceeding with extraction...');
    
    // Call the Apify service
    console.log('🔄 Calling Apify transcript extraction service...');
    const startTime = Date.now();
    const transcriptSegments = await fetchTranscriptWithApify(videoId, apiToken);
    const endTime = Date.now();
    
    if (!transcriptSegments || transcriptSegments.length === 0) {
      console.error('❌ No transcript segments returned from Apify');
      return;
    }
    
    // Calculate time taken
    const timeSeconds = ((endTime - startTime) / 1000).toFixed(2);
    
    console.log(`✅ SUCCESS! Extracted ${transcriptSegments.length} transcript segments in ${timeSeconds}s`);
    
    // Save to file for inspection
    const outputFile = path.join(logDir, `apify-result-${videoId}.json`);
    fs.writeFileSync(outputFile, JSON.stringify(transcriptSegments, null, 2));
    console.log(`💾 Saved transcript to: ${outputFile}`);
    
    // Display sample of transcript
    console.log('\n📝 TRANSCRIPT SAMPLE:');
    console.log('-------------------');
    
    const sampleSize = Math.min(5, transcriptSegments.length);
    for (let i = 0; i < sampleSize; i++) {
      const segment = transcriptSegments[i];
      console.log(`[${segment.startTime}] ${segment.text}`);
    }
    
    if (transcriptSegments.length > sampleSize) {
      console.log(`... and ${transcriptSegments.length - sampleSize} more segments`);
    }
    
    return true;
    
  } catch (error) {
    console.error('❌ Error testing Apify method:', error);
    return false;
  }
}

// Run the test with the provided YouTube URL
const videoUrl = 'https://youtu.be/BvCOZrqGyNU?si=mcQYgsigwY2xfDr1';
testApifyMethod(videoUrl);