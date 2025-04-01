import { getYoutubeTranscript } from './server/services/youtube.js';

// YouTube video with known public captions (YouTube tutorial)
const videoUrl = 'https://www.youtube.com/watch?v=w7ejDZ8SWv8'; // React JS Crash Course by Traversy Media

async function testTranscript() {
  try {
    console.log(`Testing transcript extraction for: ${videoUrl}`);
    const transcript = await getYoutubeTranscript(videoUrl);
    
    if (transcript) {
      // Only show a sample of the transcript (first 500 chars)
      console.log('\nTranscript excerpt:');
      console.log(transcript.substring(0, 500) + '...\n');
      console.log('SUCCESS: Transcript extracted successfully!');
    } else {
      console.log('ERROR: No transcript returned');
    }
  } catch (error) {
    console.error('ERROR during transcript extraction:', error);
  }
}

testTranscript();