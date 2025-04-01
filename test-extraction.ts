/**
 * Test script for testing YouTube transcript extraction
 * This script tests the Puppeteer-based transcript extraction from a specific YouTube video
 */

import { extractYoutubeTranscript } from './scripts/puppeteer-transcript';

// Function to extract YouTube ID from various URL formats
function extractYoutubeId(url: string): string | null {
  if (!url) return null;
  
  // If the input is already just an ID (11 characters of letters, numbers, underscore, and dash)
  if (/^[a-zA-Z0-9_-]{11}$/.test(url)) {
    return url;
  }
  
  // Extract from various YouTube URL formats
  const regexPatterns = [
    /(?:https?:\/\/)?(?:www\.)?youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})(?:&.+)?/,
    /(?:https?:\/\/)?(?:www\.)?youtube\.com\/embed\/([a-zA-Z0-9_-]{11})(?:\?.+)?/,
    /(?:https?:\/\/)?(?:www\.)?youtube\.com\/v\/([a-zA-Z0-9_-]{11})(?:\?.+)?/,
    /(?:https?:\/\/)?(?:www\.)?youtu\.be\/([a-zA-Z0-9_-]{11})(?:\?.+)?/,
    /(?:https?:\/\/)?(?:www\.)?youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})(?:\?.+)?/
  ];
  
  for (const pattern of regexPatterns) {
    const match = url.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }
  
  return null;
}

async function testSpecificVideo(videoUrl: string) {
  console.log(`Testing transcript extraction for video URL: ${videoUrl}`);
  
  try {
    // Extract the YouTube video ID from the URL
    const videoId = extractYoutubeId(videoUrl);
    if (!videoId) {
      console.error('Could not extract video ID from URL');
      return;
    }
    
    console.log(`Extracted video ID: ${videoId}`);
    
    // Extract the transcript using the Puppeteer method
    console.log('Starting transcript extraction using Puppeteer...');
    const transcript = await extractYoutubeTranscript(videoId);
    
    if (transcript && transcript.length > 0) {
      console.log(`\nSuccess! Extracted ${transcript.length} transcript segments`);
      console.log('\nFirst 5 segments:');
      transcript.slice(0, 5).forEach(segment => {
        console.log(`[${segment.startTime}] ${segment.text}`);
      });
      
      console.log('\nLast 5 segments:');
      transcript.slice(-5).forEach(segment => {
        console.log(`[${segment.startTime}] ${segment.text}`);
      });
    } else {
      console.log('No transcript segments were extracted. The video might not have captions or there was an error.');
    }
  } catch (error) {
    console.error('Error during transcript extraction:', error);
  }
}

// Use the video URL from the command line argument or use the default
const videoUrl = process.argv[2] || 'https://youtu.be/XMVzT8X0QTA?si=XccI2VXd47rMcQNy';
testSpecificVideo(videoUrl);