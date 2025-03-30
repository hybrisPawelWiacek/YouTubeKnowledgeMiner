/**
 * Test script for the anonymous session migration endpoint
 * 
 * This script does the following:
 * 1. Makes a request to migrate anonymous videos to a registered user
 * 2. Logs the response from the server
 * 
 * Usage: npx tsx scripts/test-migration.ts <anonymousSessionId> <authToken>
 */

import fetch from 'node-fetch';

interface MigrationResponse {
  success: boolean;
  data?: {
    migratedVideos: number;
  };
  message?: string;
  error?: {
    message: string;
    code: string;
  };
}

async function testMigration(): Promise<void> {
  const args = process.argv.slice(2);
  
  // If there's only one argument, assume it's the auth token
  let anonymousSessionId = 'anon_1743026299677_qykrcr5s1';
  let authToken: string | undefined;
  
  if (args.length === 1) {
    authToken = args[0];
  } else if (args.length >= 2) {
    anonymousSessionId = args[0];
    authToken = args[1];
  }

  if (!authToken) {
    console.error('Usage: npx tsx scripts/test-migration.ts [anonymousSessionId] <authToken>');
    console.error('Example: npx tsx scripts/test-migration.ts "$(cat auth_session_token.txt)"');
    console.error('Note: anonymousSessionId is optional and defaults to anon_1743026299677_qykrcr5s1');
    process.exit(1);
  }

  console.log(`Testing migration for anonymous session: ${anonymousSessionId}`);
  console.log('Auth token provided (first 10 chars):', authToken.substring(0, 10) + '...');

  try {
    // Determine the server URL based on the environment
    // Use localhost for local testing, otherwise fall back to the deployed URL if needed
    const serverUrl = process.env.NODE_ENV === 'production' 
      ? (process.env.REPLIT_URL || 'https://youtubeknowledgeminer.replit.app')
      : 'http://localhost:5000';
    
    console.log(`Using server URL: ${serverUrl}`);
    const response = await fetch(`${serverUrl}/api/auth/migrate-anonymous-data`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': `auth_session=${authToken}`,
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({
        anonymousSessionId: anonymousSessionId
      })
    });

    // Check if the response has a JSON content type
    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      console.log('Response status:', response.status);
      console.log('Response is not JSON. Content type:', contentType);
      console.log('Response text:', await response.text());
      console.log('❌ Migration failed: Response is not in JSON format');
      return;
    }
    
    const result = await response.json() as MigrationResponse;
    
    console.log('Response status:', response.status);
    console.log('Response body:', JSON.stringify(result, null, 2));
    
    if (response.ok) {
      console.log(`✅ Migration successful! ${result.data?.migratedVideos || 0} videos migrated.`);
    } else {
      console.log('❌ Migration failed:', result.error?.message || result.message || 'Unknown error');
    }
  } catch (error) {
    console.error('Error making request:', error);
  }
}

testMigration();