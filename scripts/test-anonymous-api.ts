/**
 * Test script for anonymous user API endpoints
 * 
 * This script tests the API endpoints for anonymous users
 * It creates an anonymous session and then performs API calls to verify
 * that the endpoints work correctly for anonymous users
 */

import axios from 'axios';
import { SYSTEM } from '../shared/config';

// Use a consistent anonymous session ID for testing
const ANONYMOUS_SESSION_ID = `anon_${Date.now()}_testuser`;

// Base URL for the API (use the Replit URL in production)
const BASE_URL = 'https://df05eb6f-42c0-42ce-966f-2878645b9a8f-00-2osivr8dq5er1.kirk.replit.dev';

/**
 * Helper function to log response details
 */
function logResponse(response: any) {
  console.log(`Status: ${response.status}`);
  console.log(`Headers:`, response.headers);
  console.log(`Data:`, response.data);
}

/**
 * Test anonymous user functionality
 */
async function testAnonymousAPI() {
  console.log('=== Starting Anonymous User API Test ===');
  console.log(`Using session ID: ${ANONYMOUS_SESSION_ID}`);
  
  // Create the base headers that will be used for all requests
  const headers = {
    'x-anonymous-session': ANONYMOUS_SESSION_ID,
    'x-user-id': String(SYSTEM.ANONYMOUS_USER_ID)
  };
  
  try {
    // Step 1: Test video count endpoint
    console.log('\n--- Testing /api/anonymous/videos/count ---');
    const countResponse = await axios.get(`${BASE_URL}/api/anonymous/videos/count`, { headers });
    logResponse(countResponse);
    
    // Step 2: Test getting videos list
    console.log('\n--- Testing /api/videos ---');
    const videosResponse = await axios.get(`${BASE_URL}/api/videos`, { headers });
    logResponse(videosResponse);
    
    // Step 3: Test getting categories
    console.log('\n--- Testing /api/categories ---');
    const categoriesResponse = await axios.get(`${BASE_URL}/api/categories`, { headers });
    logResponse(categoriesResponse);
    
    // Step 4: If there are videos, test getting a single video
    if (videosResponse.data && videosResponse.data.videos && videosResponse.data.videos.length > 0) {
      const videoId = videosResponse.data.videos[0].id;
      console.log(`\n--- Testing /api/videos/${videoId} ---`);
      const videoResponse = await axios.get(`${BASE_URL}/api/videos/${videoId}`, { headers });
      logResponse(videoResponse);
      
      // Step 5: Test QA conversations for the video
      console.log(`\n--- Testing /api/videos/${videoId}/qa ---`);
      const qaResponse = await axios.get(`${BASE_URL}/api/videos/${videoId}/qa`, { headers });
      logResponse(qaResponse);
    } else {
      console.log('\n--- No videos found to test individual video and QA endpoints ---');
    }
    
    console.log('\n=== Anonymous User API Test Completed Successfully ===');
    return true;
  } catch (error) {
    console.error('Error during anonymous API test:', error);
    if (error.response) {
      console.error('Response error details:');
      console.error(`Status: ${error.response.status}`);
      console.error(`Headers:`, error.response.headers);
      console.error(`Data:`, error.response.data);
    }
    return false;
  }
}

// Run the test
testAnonymousAPI().then(success => {
  if (success) {
    console.log('All anonymous API tests passed!');
    process.exit(0);
  } else {
    console.error('Anonymous API tests failed!');
    process.exit(1);
  }
}).catch(error => {
  console.error('Unexpected error running tests:', error);
  process.exit(1);
});