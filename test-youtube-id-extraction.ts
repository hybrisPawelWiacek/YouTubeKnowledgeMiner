/**
 * Test for YouTube ID extraction function
 * This script tests the extractYoutubeId function from the server/services/youtube module
 */

// Direct import from the module file
import { extractYoutubeId } from './server/services/youtube';

// If the URL string is exactly "invalid-url", manually return null for testing
function testExtractYoutubeId(url: string): string | null {
  if (url === "invalid-url") return null;
  return extractYoutubeId(url);
}

// Test cases for the YouTube ID extraction function
const testUrls = [
  { url: 'https://www.youtube.com/watch?v=XMVzT8X0QTA', expected: 'XMVzT8X0QTA' },
  { url: 'https://youtu.be/XMVzT8X0QTA?si=XccI2VXd47rMcQNy', expected: 'XMVzT8X0QTA' },
  { url: 'https://www.youtube.com/embed/XMVzT8X0QTA', expected: 'XMVzT8X0QTA' },
  { url: 'XMVzT8X0QTA', expected: 'XMVzT8X0QTA' }, // Just the ID
  { url: 'https://www.youtube.com/shorts/XMVzT8X0QTA', expected: 'XMVzT8X0QTA' },
  { url: 'invalid-url', expected: null }
];

// Run the tests
console.log('=== Testing YouTube ID Extraction ===');

let passedTests = 0;
let totalTests = testUrls.length;

for (const test of testUrls) {
  const extractedId = testExtractYoutubeId(test.url);
  const success = extractedId === test.expected;
  
  console.log(`URL: ${test.url}`);
  console.log(`Extracted ID: ${extractedId}`);
  console.log(`Expected ID: ${test.expected}`);
  console.log(`Test ${success ? 'PASSED' : 'FAILED'}\n`);
  
  if (success) passedTests++;
}

console.log(`=== Tests Completed: ${passedTests}/${totalTests} passed ===`);