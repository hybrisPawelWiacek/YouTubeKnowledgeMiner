import { db } from '../server/db';
import { processConversationEmbeddings } from '../server/services/embeddings';
import { videos } from '../shared/schema';
import { sql } from 'drizzle-orm';
import dotenv from 'dotenv';
import { performSemanticSearch } from '../server/services/embeddings'; 
import { initializeVectorFunctions } from '../server/services/supabase';

dotenv.config();

/**
 * This script tests the semantic search functionality with conversation content
 */
async function testSemanticSearchConversation() {
  try {
    console.log('Testing semantic search with conversation content...');
    
    // Initialize vector functions for semantic search
    await initializeVectorFunctions();
    
    // Fetch a sample video to use for the test
    const sampleVideos = await db.select().from(videos).limit(1);
    
    if (sampleVideos.length === 0) {
      console.error('No videos found in the database for testing');
      return;
    }
    
    const testVideo = sampleVideos[0];
    console.log(`Using test video: ${testVideo.title} (ID: ${testVideo.id})`);
    
    // First ensure we have some conversation embeddings
    console.log('Checking for existing conversation embeddings...');
    const existingConversations = await db.execute(sql`
      SELECT * FROM embeddings 
      WHERE video_id = ${testVideo.id} 
      AND content_type = 'conversation'
    `);
    
    // If no existing conversation embeddings, create some
    if (existingConversations.rows.length === 0) {
      console.log('No conversation embeddings found. Creating test conversation embeddings...');
      
      // Create a sample conversation for testing
      const testConversation = [
        { role: 'user', content: 'What is the main topic of this video?' },
        { role: 'assistant', content: 'The main topic is about artificial intelligence and its applications in modern society.' },
        { role: 'user', content: 'Can you tell me more about the ethical considerations mentioned?' },
        { role: 'assistant', content: 'The video discusses several ethical considerations, including privacy concerns, bias in algorithms, and the potential for job displacement. The speaker emphasizes the importance of developing AI with strong ethical frameworks.' }
      ];
      
      await processConversationEmbeddings(
        testVideo.id,
        testVideo.user_id,
        testConversation
      );
      
      console.log('Created new conversation embeddings for testing');
    } else {
      console.log(`Found ${existingConversations.rows.length} existing conversation embeddings`);
    }
    
    // Test semantic search with a query that should match the conversation
    const testQuery = "ethical concerns AI";
    console.log(`Performing semantic search with query: "${testQuery}"`);
    
    // Execute the search focused only on conversation content
    const searchResults = await performSemanticSearch(
      testVideo.user_id, 
      testQuery, 
      {
        contentTypes: ['conversation'],
        videoId: testVideo.id
      },
      10 // limit
    );
    
    console.log(`Semantic search returned ${searchResults.length} results`);
    
    // Print the results
    searchResults.forEach((result, index) => {
      console.log(`\nResult ${index + 1}:`);
      console.log(`Content: ${result.content.substring(0, 100)}${result.content.length > 100 ? '...' : ''}`);
      console.log(`Score: ${result.score}`);
      console.log(`Content Type: ${result.content_type}`);
    });
    
  } catch (error) {
    console.error('Error testing semantic search with conversations:', error);
    process.exit(1);
  }
}

// Run the test
testSemanticSearchConversation()
  .then(() => {
    console.log('\nTest completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Test failed:', error);
    process.exit(1);
  });