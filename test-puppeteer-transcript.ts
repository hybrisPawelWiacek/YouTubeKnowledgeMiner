/**
 * Test script for the Puppeteer-based YouTube transcript extraction
 */
import { extractYoutubeTranscript, testExtraction } from './scripts/puppeteer-transcript';
import fs from 'fs';
import path from 'path';

async function testPuppeteerTranscript() {
  console.log('Starting Puppeteer transcript test...');
  
  // Test with a known video that has transcripts
  // TED talk: "The surprising science of happiness"
  const videoId = '4q1dgn_C0AU';
  
  try {
    // Using the testExtraction function that's already defined
    await testExtraction(videoId);
    
    // Additionally, run the extraction directly to save results
    console.log('\nRunning direct extraction test:');
    const transcript = await extractYoutubeTranscript(videoId);
    
    if (transcript && transcript.length > 0) {
      console.log(`Success! Extracted ${transcript.length} transcript segments.`);
      
      // Save the complete transcript for review
      const outputDir = path.join(__dirname, 'logs', 'transcript');
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }
      
      const outputFile = path.join(outputDir, `full-transcript-${videoId}.json`);
      fs.writeFileSync(outputFile, JSON.stringify(transcript, null, 2));
      console.log(`Full transcript saved to: ${outputFile}`);
      
      // Display first 5 and last 5 segments
      console.log('\nFirst 5 segments:');
      transcript.slice(0, 5).forEach(segment => {
        console.log(`[${segment.startTime}] ${segment.text}`);
      });
      
      console.log('\nLast 5 segments:');
      transcript.slice(-5).forEach(segment => {
        console.log(`[${segment.startTime}] ${segment.text}`);
      });
    } else {
      console.log('No transcript segments were extracted.');
    }
  } catch (error) {
    console.error('Error during transcript extraction test:', error);
  }
}

// Run the test if this script is executed directly
if (require.main === module) {
  testPuppeteerTranscript()
    .then(() => console.log('Test completed.'))
    .catch(error => console.error('Test failed:', error));
}