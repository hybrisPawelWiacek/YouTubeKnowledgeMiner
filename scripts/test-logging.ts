/**
 * Test script for logging system
 * 
 * This script tests the logging functionality by making various API requests
 * and then retrieving and displaying logs through the logging API endpoints.
 */

import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';

// Base URL for API requests
const API_BASE_URL = 'http://localhost:5000/api';

/**
 * Generate a test log entry by making an API request
 * @param method HTTP method
 * @param endpoint API endpoint
 * @param data Request data (for POST/PUT)
 */
async function generateTestLog(method: string, endpoint: string, data?: any) {
  try {
    console.log(`Making ${method} request to ${endpoint}...`);
    
    const response = await axios({
      method,
      url: `${API_BASE_URL}${endpoint}`,
      data: method !== 'GET' ? data : undefined,
      headers: {
        'X-Anonymous-Session': `test_session_${Date.now()}`,
        'Content-Type': 'application/json'
      }
    });
    
    console.log(`Response status: ${response.status}`);
    
    // Return the request ID for later lookup
    return response.headers['x-request-id'];
  } catch (error: any) {
    console.error(`Error making request: ${error.message}`);
    
    // If we have a response, extract the request ID
    if (error.response) {
      console.log(`Response status: ${error.response.status}`);
      return error.response.headers['x-request-id'];
    }
    
    return null;
  }
}

/**
 * Get logs for a specific request ID
 * @param requestId The request ID
 */
async function getLogsByRequestId(requestId: string) {
  try {
    console.log(`Fetching logs for request ID: ${requestId}...`);
    
    const response = await axios.get(`${API_BASE_URL}/logs/${requestId}`, {
      params: {
        dev_access: 'true'
      }
    });
    
    console.log('Logs retrieved:');
    console.log(JSON.stringify(response.data, null, 2));
    
    return response.data;
  } catch (error: any) {
    console.error(`Error fetching logs: ${error.message}`);
    return null;
  }
}

/**
 * Get available log files
 */
async function getLogFiles() {
  try {
    console.log('Fetching available log files...');
    
    const response = await axios.get(`${API_BASE_URL}/logs/files`, {
      params: {
        dev_access: 'true'
      }
    });
    
    console.log('Log files:');
    console.log(JSON.stringify(response.data, null, 2));
    
    return response.data;
  } catch (error: any) {
    console.error(`Error fetching log files: ${error.message}`);
    return null;
  }
}

/**
 * Get logs with filtering
 */
async function getFilteredLogs() {
  try {
    console.log('Fetching filtered logs...');
    
    const response = await axios.get(`${API_BASE_URL}/logs`, {
      params: {
        level: 'info',
        logFile: 'combined',
        limit: 10,
        offset: 0,
        dev_access: 'true'
      }
    });
    
    console.log('Filtered logs:');
    console.log(JSON.stringify(response.data, null, 2));
    
    return response.data;
  } catch (error: any) {
    console.error(`Error fetching filtered logs: ${error.message}`);
    return null;
  }
}

/**
 * Main test function
 */
async function testLoggingSystem() {
  console.log('=== Testing Logging System ===');
  
  // First, check if logs directory exists (create if not)
  const logsDir = path.join(process.cwd(), 'logs');
  if (!fs.existsSync(logsDir)) {
    console.log('Creating logs directory...');
    fs.mkdirSync(logsDir, { recursive: true });
  }
  
  // Generate some test logs with different request types
  console.log('\n1. Generating test logs with different request types...');
  
  const requestId1 = await generateTestLog('GET', '/anonymous/videos/count');
  console.log(`Request ID: ${requestId1}`);
  
  const requestId2 = await generateTestLog('POST', '/anonymous/videos', {
    youtube_id: 'test_video_id',
    title: 'Test Video',
    channel_name: 'Test Channel',
    description: 'This is a test video for logging'
  });
  console.log(`Request ID: ${requestId2}`);
  
  // Wait a moment for logs to be written
  console.log('\nWaiting for logs to be written...');
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // Test retrieving logs by request ID
  if (requestId1) {
    console.log('\n2. Retrieving logs for first request...');
    await getLogsByRequestId(requestId1);
  }
  
  // Test retrieving available log files
  console.log('\n3. Retrieving available log files...');
  await getLogFiles();
  
  // Test retrieving filtered logs
  console.log('\n4. Retrieving filtered logs...');
  await getFilteredLogs();
  
  console.log('\n=== Logging System Test Complete ===');
}

// Run the test function
testLoggingSystem().catch(console.error);