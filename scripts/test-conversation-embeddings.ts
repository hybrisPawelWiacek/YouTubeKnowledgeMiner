import { db } from '../server/db';
import { processConversationEmbeddings } from '../server/services/embeddings';
import { videos } from '../shared/schema';
import { sql } from 'drizzle-orm';
import dotenv from 'dotenv';

dotenv.config();

/**
 * This script tests the conversation embeddings functionality
 * It retrieves a sample video and generates embeddings for a test conversation
 */
async function testConversationEmbeddings() {
  try {
    console.log('Testing conversation embeddings...');
    
    // Fetch a sample video to use for the test
    const sampleVideos = await db.select().from(videos).limit(1);
    
    if (sampleVideos.length === 0) {
      console.error('No videos found in the database for testing');
      return;
    }
    
    const testVideo = sampleVideos[0];
    console.log(`Using test video: ${testVideo.title} (ID: ${testVideo.id})`);
    
    // Create a sample conversation for testing
    const testConversation = [
      { role: 'user', content: 'What is the main topic of this video?' },
      { role: 'assistant', content: 'The main topic is about artificial intelligence and its applications in modern society.' },
      { role: 'user', content: 'Can you tell me more about the ethical considerations mentioned?' },
      { role: 'assistant', content: 'The video discusses several ethical considerations, including privacy concerns, bias in algorithms, and the potential for job displacement. The speaker emphasizes the importance of developing AI with strong ethical frameworks.' }
    ];
    
    console.log('Processing conversation embeddings...');
    const embeddingIds = await processConversationEmbeddings(
      testVideo.id,
      testVideo.user_id,
      testConversation
    );
    
    console.log(`Successfully processed ${embeddingIds.length} conversation embeddings!`);
    console.log('Embedding IDs:', embeddingIds);
    
    // Verify the embeddings were created with the correct content type using SQL directly
    const embeddingQuery = await db.execute(sql`
      SELECT * FROM embeddings 
      WHERE video_id = ${testVideo.id} 
      AND content_type = 'conversation'
    `);
    
    console.log(`Found ${embeddingQuery.rows.length} conversation embeddings for the test video`);
    
  } catch (error) {
    console.error('Error testing conversation embeddings:', error);
    process.exit(1);
  }
}

// Run the test
testConversationEmbeddings()
  .then(() => {
    console.log('Test completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Test failed:', error);
    process.exit(1);
  });