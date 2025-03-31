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
import * as fs from 'fs';
import * as path from 'path';

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

/**
 * Helper function to save auth token to file for later use
 */
function saveAuthToken(token: string): void {
  try {
    const tokenFile = path.resolve(process.cwd(), 'auth_session_token.txt');
    fs.writeFileSync(tokenFile, token);
    console.log(`✅ Auth token saved to ${tokenFile}`);
  } catch (error) {
    console.error('❌ Error saving auth token:', error);
  }
}

/**
 * Helper function to read auth token from file if it exists
 */
function readAuthToken(): string | null {
  try {
    const tokenFile = path.resolve(process.cwd(), 'auth_session_token.txt');
    if (fs.existsSync(tokenFile)) {
      const token = fs.readFileSync(tokenFile, 'utf8').trim();
      console.log('📄 Found auth token in file');
      return token;
    }
  } catch (error) {
    console.error('❌ Error reading auth token file:', error);
  }
  return null;
}

async function testMigration(): Promise<void> {
  const args = process.argv.slice(2);
  
  // If there's only one argument, assume it's the anonymous session ID
  let anonymousSessionId = args.length > 0 ? args[0] : 'anon_1743363425764_0cavqden';
  let authToken: string | undefined;

  // Try to read from file if no token provided
  if (!authToken) {
    const savedToken = readAuthToken();
    if (savedToken) {
      authToken = savedToken;
      console.log('ℹ️ Using auth token from file');
    }
  }

  if (!authToken) {
    console.error('Usage: npx tsx scripts/test-migration.ts [anonymousSessionId] <authToken>');
    console.error('Example: npx tsx scripts/test-migration.ts anon_1743363425764_0cavqden');
    console.error('Note: anonymousSessionId is optional and defaults to anon_1743363425764_0cavqden');
    process.exit(1);
  }
  
  // Save token for future use
  saveAuthToken(authToken);

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
      console.log('Error code:', result.error?.code || 'UNKNOWN');
      
      if (result.error?.code === 'AUTH_REQUIRED') {
        console.log('\n🔑 Authentication issue detected!');
        console.log('Make sure your authentication token is valid and not expired.');
        console.log('You may need to log in again to get a fresh token.');
      }
    }
  } catch (error) {
    console.error('Error making request:', error);
  }
}

testMigration();