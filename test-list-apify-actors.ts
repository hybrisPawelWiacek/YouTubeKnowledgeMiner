/**
 * Test script to list available Apify actors related to YouTube transcripts
 */
import { ApifyClient } from 'apify-client';

async function listAvailableActors() {
  console.log('Listing available Apify actors related to YouTube transcripts...');
  
  // Get the Apify API token from environment variables
  const apiToken = process.env.APIFY_API_TOKEN;
  if (!apiToken) {
    console.error('No Apify API token found in environment variables.');
    return;
  }
  
  console.log('Apify API token is available, proceeding with listing actors...');
  
  try {
    // Initialize the Apify client
    const apifyClient = new ApifyClient({
      token: apiToken,
    });
    
    // Search for actors
    console.log('Searching for YouTube transcript actors...');
    
    // List store items (public actors) with search
    const { items } = await apifyClient.store().listActors({
      search: 'youtube transcript',
    });
    
    if (!items || items.length === 0) {
      console.log('No actors found matching the search criteria.');
      return;
    }
    
    console.log(`Found ${items.length} actors matching the search criteria:`);
    
    // Display actor details
    items.forEach((actor: any, index: number) => {
      console.log(`\n${index + 1}. ACTOR: ${actor.name}`);
      console.log(`   ID: ${actor.id}`);
      console.log(`   Description: ${actor.description?.slice(0, 100)}...`);
      console.log(`   Version: ${actor.version}`);
    });
    
  } catch (error) {
    console.error('Error listing actors:', error);
  }
}

// Run the actor listing function
listAvailableActors();