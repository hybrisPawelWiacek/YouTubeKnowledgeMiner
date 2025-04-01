/**
 * A simplified test script focusing only on the Puppeteer method
 */
import { extractYoutubeId } from './server/services/youtube';
import { extractYoutubeTranscript } from './scripts/puppeteer-transcript';
import * as fs from 'fs';
import path from 'path';

// Create logs directory if it doesn't exist
const logDir = './logs/transcript';
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

async function testPuppeteerMethod(videoUrl: string) {
  console.log(`\n🔍 TESTING PUPPETEER METHOD FOR: ${videoUrl}\n`);
  
  // Extract the YouTube ID
  const videoId = extractYoutubeId(videoUrl);
  if (!videoId) {
    console.error('❌ Invalid YouTube URL or ID provided');
    return;
  }
  
  console.log(`📋 Extracted video ID: ${videoId}`);
  
  try {
    console.log('🔄 Starting Puppeteer browser (this may take a moment)...');
    const startTime = Date.now();
    
    // Use the Puppeteer-based extractYoutubeTranscript function
    // Set a timeout for the operation
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Puppeteer operation timed out after 60 seconds')), 60000);
    });
    
    const transcriptPromise = extractYoutubeTranscript(videoId);
    
    // Race between the extraction and the timeout
    const transcriptSegments = await Promise.race([
      transcriptPromise,
      timeoutPromise
    ]) as any[];
    
    const endTime = Date.now();
    const timeSeconds = ((endTime - startTime) / 1000).toFixed(2);
    
    if (!transcriptSegments || transcriptSegments.length === 0) {
      console.error('❌ No transcript segments returned from Puppeteer');
      return false;
    }
    
    console.log(`✅ SUCCESS! Extracted ${transcriptSegments.length} transcript segments in ${timeSeconds}s`);
    
    // Save to file for inspection
    const outputFile = path.join(logDir, `puppeteer-result-${videoId}.json`);
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
    console.error('❌ Error in Puppeteer method:', error);
    return false;
  }
}

// Run the test with the provided YouTube URL
const videoUrl = 'https://youtu.be/BvCOZrqGyNU?si=mcQYgsigwY2xfDr1';
testPuppeteerMethod(videoUrl);