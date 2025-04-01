const { YoutubeTranscript } = require('youtube-transcript');
const fs = require('fs');

// Write logs to file instead of console to avoid mixing with JSON output
function logToFile(message) {
  try {
    fs.appendFileSync('./logs/transcript/helper.log', `${new Date().toISOString()} - ${message}\n`);
  } catch (e) {
    // Create directory if it doesn't exist
    try {
      if (!fs.existsSync('./logs/transcript')) {
        fs.mkdirSync('./logs/transcript', { recursive: true });
        fs.appendFileSync('./logs/transcript/helper.log', `${new Date().toISOString()} - ${message}\n`);
      }
    } catch (err) {
      // Silently fail - we don't want to interfere with the JSON output
    }
  }
}

async function getTranscript(videoId) {
  try {
    logToFile(`Attempting to fetch transcript for video: ${videoId}`);
    const transcript = await YoutubeTranscript.fetchTranscript(videoId);
    
    if (!transcript || transcript.length === 0) {
      logToFile('Empty transcript returned from YoutubeTranscript');
      return null;
    }
    
    logToFile(`Successfully fetched transcript with ${transcript.length} items`);
    return transcript;
  } catch (error) {
    logToFile(`Error getting transcript: ${error.message}`);
    // Return empty array instead of null so we can properly identify when a transcript
    // was attempted but failed vs. when no transcript items were returned
    return [];
  }
}

// Get the video ID from command line arguments
const videoId = process.argv[2];

if (!videoId) {
  logToFile('No video ID provided');
  // Write an empty array to stdout for consistent JSON parsing
  console.log('[]');
  process.exit(1);
}

// Get the transcript and print it as JSON
getTranscript(videoId).then(transcript => {
  // Always output valid JSON, even if transcript is null
  console.log(JSON.stringify(transcript || []));
}).catch(error => {
  logToFile(`Unexpected error: ${error.message}`);
  // Output empty array for consistent JSON parsing
  console.log('[]');
  process.exit(1);
});