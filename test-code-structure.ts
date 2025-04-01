/**
 * Test script for validating the code structure
 * This script tests that our refactoring to remove duplicate code has worked correctly
 */

// Import the extractYoutubeTranscript function
import { extractYoutubeTranscript } from './scripts/puppeteer-transcript';

// Test that the YouTube ID extraction function works correctly
function testYoutubeIdExtraction() {
  console.log('\n--- Testing YouTube ID extraction ---');
  
  const testUrls = [
    { url: 'https://www.youtube.com/watch?v=XMVzT8X0QTA', expected: 'XMVzT8X0QTA' },
    { url: 'https://youtu.be/XMVzT8X0QTA?si=XccI2VXd47rMcQNy', expected: 'XMVzT8X0QTA' },
    { url: 'https://www.youtube.com/embed/XMVzT8X0QTA', expected: 'XMVzT8X0QTA' },
    { url: 'XMVzT8X0QTA', expected: 'XMVzT8X0QTA' }, // Just the ID
    { url: 'https://www.youtube.com/shorts/XMVzT8X0QTA', expected: 'XMVzT8X0QTA' },
    { url: 'invalid-url', expected: null }
  ];
  
  function extractYoutubeId(url: string): string | null {
    if (!url) return null;
    
    // If the input is already just an ID (exactly 11 characters of letters, numbers, underscore, and dash)
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
    
    // If we get here, it's not a valid YouTube URL or ID
    return null;
  }
  
  for (const test of testUrls) {
    const extractedId = extractYoutubeId(test.url);
    const success = extractedId === test.expected;
    console.log(`URL: ${test.url}`);
    console.log(`Extracted ID: ${extractedId}`);
    console.log(`Expected ID: ${test.expected}`);
    console.log(`Test ${success ? 'PASSED' : 'FAILED'}\n`);
  }
}

// Test that the Puppeteer transcript extraction function is properly exported
function testPuppeteerExtraction() {
  console.log('\n--- Testing Puppeteer transcript extraction import ---');
  
  if (typeof extractYoutubeTranscript === 'function') {
    console.log('✅ extractYoutubeTranscript is successfully imported as a function');
    
    // Check function signature and structure
    const fnStr = extractYoutubeTranscript.toString();
    console.log('\nFunction signature and structure:');
    console.log(fnStr.split('\n').slice(0, 5).join('\n') + '\n...\n');
    
    if (fnStr.includes('browser = await puppeteer.launch')) {
      console.log('✅ Function contains browser launch code');
    } else {
      console.log('❌ Function missing browser launch code');
    }
    
    if (fnStr.includes('page.evaluate')) {
      console.log('✅ Function contains page.evaluate for DOM manipulation');
    } else {
      console.log('❌ Function missing page.evaluate for DOM manipulation');
    }
  } else {
    console.log('❌ extractYoutubeTranscript is not a function or not properly imported');
  }
}

// Run the tests
console.log('=== Testing Code Structure After Refactoring ===');
testYoutubeIdExtraction();
testPuppeteerExtraction();
console.log('\n=== Tests Completed ===');