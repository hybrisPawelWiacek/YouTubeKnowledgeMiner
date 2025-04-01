/**
 * Simple test for YouTube transcript extraction
 */

import { extractYoutubeTranscript } from './scripts/puppeteer-transcript';

// Use a short video that definitely has a transcript
const VIDEO_ID = 'jNQXAC9IVRw'; // "Me at the zoo" (first YouTube video ever)

async function simpleTest() {
  console.log(`Testing transcript extraction for video: ${VIDEO_ID}`);
  
  try {
    console.time('Extraction time');
    const transcript = await extractYoutubeTranscript(VIDEO_ID);
    console.timeEnd('Extraction time');
    
    if (!transcript || transcript.length === 0) {
      console.log('No transcript segments found!');
      return false;
    }
    
    console.log(`Success! Extracted ${transcript.length} transcript segments.`);
    console.log('\nFirst 3 segments:');
    transcript.slice(0, 3).forEach(segment => {
      console.log(`[${segment.startTime}] ${segment.text}`);
    });
    
    return true;
  } catch (error: any) {
    console.error('Error extracting transcript:', error.message || 'Unknown error');
    return false;
  }
}

// Run the simple test
simpleTest()
  .then(success => {
    if (success) {
      console.log('\nTest PASSED! ✅');
      process.exit(0);
    } else {
      console.log('\nTest FAILED! ❌');
      process.exit(1);
    }
  })
  .catch(err => {
    console.error('Unexpected error during test:', err);
    process.exit(1);
  });