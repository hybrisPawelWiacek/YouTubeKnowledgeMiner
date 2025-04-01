/**
 * Test script for the Apify-based YouTube transcript extraction
 */
import { fetchTranscriptWithApify } from './server/services/apify-transcript';
import * as fs from 'fs';
import * as path from 'path';

// Create logs directory if it doesn't exist
const logDir = './logs/transcript';
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

async function testApifyTranscript(videoId: string) {
  console.log(`Testing Apify transcript extraction for video ID: ${videoId}`);
  
  // Get the Apify API token from environment variables
  const apiToken = process.env.APIFY_API_TOKEN;
  if (!apiToken) {
    console.error('No Apify API token found in environment variables.');
    return;
  }
  
  console.log('Apify API token is available, proceeding with test...');
  
  try {
    // Call the Apify transcript extraction function
    const transcriptSegments = await fetchTranscriptWithApify(videoId, apiToken);
    
    if (!transcriptSegments || transcriptSegments.length === 0) {
      console.error('No transcript segments returned from Apify.');
      return;
    }
    
    console.log(`Successfully extracted ${transcriptSegments.length} transcript segments.`);
    
    // Save the transcript segments to a file
    const outputPath = path.join(logDir, `apify-test-${videoId}.json`);
    fs.writeFileSync(outputPath, JSON.stringify(transcriptSegments, null, 2));
    
    console.log(`Transcript segments saved to ${outputPath}`);
    
    // Print a sample of the transcript
    console.log('\nSample transcript segments:');
    transcriptSegments.slice(0, 5).forEach((segment, index) => {
      console.log(`[${segment.startTime}] ${segment.text}`);
    });
    
    console.log(`\n... and ${transcriptSegments.length - 5} more segments.`);
    console.log('Test completed successfully.');
    
  } catch (error) {
    console.error('Error in Apify transcript test:', error);
  }
}

// Run the test with a sample YouTube video ID
// This is a short video with captions available
const videoId = 'jNQXAC9IVRw'; // "Me at the zoo" - The first YouTube video (18 seconds)
testApifyTranscript(videoId);