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
  const anonymousSessionId = args[0];
  const authToken = args[1];

  if (!anonymousSessionId || !authToken) {
    console.error('Usage: npx tsx scripts/test-migration.ts <anonymousSessionId> <authToken>');
    console.error('Example: npx tsx scripts/test-migration.ts anon_1234567890_abcdef yourAuthTokenHere');
    process.exit(1);
  }

  console.log(`Testing migration for anonymous session: ${anonymousSessionId}`);
  console.log('Auth token provided (first 10 chars):', authToken.substring(0, 10) + '...');

  try {
    // Make the migration request against the Replit URL
    // Note: Replace with your actual Replit URL or use environment variable
    const serverUrl = process.env.REPLIT_URL || 'https://youtubeknowledgeminer.replit.app';
    const response = await fetch(`${serverUrl}/api/auth/migrate-anonymous-data`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': `authToken=${authToken}`
      },
      body: JSON.stringify({
        sessionId: anonymousSessionId
      })
    });

    const result = await response.json() as MigrationResponse;
    
    console.log('Response status:', response.status);
    console.log('Response body:', JSON.stringify(result, null, 2));
    
    if (response.ok) {
      console.log(`✅ Migration successful! ${result.data?.migratedVideos || 0} videos migrated.`);
    } else {
      console.log('❌ Migration failed:', result.error?.message || 'Unknown error');
    }
  } catch (error) {
    console.error('Error making request:', error);
  }
}

testMigration();