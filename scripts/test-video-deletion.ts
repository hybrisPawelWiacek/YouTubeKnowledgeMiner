/**
 * Test script to verify video deletion for authenticated users
 * 
 * This script tests the bulk deletion functionality with an authenticated user
 * to ensure the cascade delete is working properly
 */
import { db } from '../server/db';
import { dbStorage } from '../server/database-storage';
import { videos, qa_conversations, collection_videos } from '../shared/schema';
import { eq } from 'drizzle-orm';

async function testVideoDelete() {
  try {
    console.log('Starting video deletion test for authenticated user...');
    
    // Use demo_basic user (ID should be 1 based on setup-demo-users script)
    const userId = 1; // demo_basic@example.com
    
    // Log existing videos for this user
    const userVideos = await dbStorage.getVideosByUserId(userId);
    console.log(`User ${userId} has ${userVideos.length} videos`);
    
    if (userVideos.length === 0) {
      console.log('No videos to delete. Test cannot continue.');
      return;
    }
    
    // Get the first video to test with
    const videoToDelete = userVideos[0];
    console.log(`Testing deletion with video ID: ${videoToDelete.id}`);
    
    // Check if this video has QA conversations
    const qaConversations = await dbStorage.getQAConversationsByVideoId(videoToDelete.id);
    console.log(`Video has ${qaConversations.length} QA conversations`);
    
    // Check if it's in any collections
    const collections = await db
      .select()
      .from(collection_videos)
      .where(eq(collection_videos.video_id, videoToDelete.id));
    console.log(`Video is in ${collections.length} collections`);
    
    // Now try to delete this video
    console.log('Attempting to delete video...');
    const deleteCount = await dbStorage.bulkDeleteVideos([videoToDelete.id]);
    
    console.log(`Deleted ${deleteCount} videos successfully`);
    
    // Verify the video was deleted
    const videoAfterDelete = await dbStorage.getVideo(videoToDelete.id);
    
    if (videoAfterDelete) {
      console.log('❌ ERROR: Video was not deleted!');
    } else {
      console.log('✅ Success: Video was deleted successfully');
      
      // Verify QA conversations were deleted too
      const qaAfterDelete = await db
        .select()
        .from(qa_conversations)
        .where(eq(qa_conversations.video_id, videoToDelete.id));
      
      if (qaAfterDelete.length > 0) {
        console.log('❌ ERROR: QA conversations were not deleted!');
      } else {
        console.log('✅ Success: QA conversations were deleted successfully');
      }
      
      // Verify collection associations were deleted too
      const collectionsAfterDelete = await db
        .select()
        .from(collection_videos)
        .where(eq(collection_videos.video_id, videoToDelete.id));
      
      if (collectionsAfterDelete.length > 0) {
        console.log('❌ ERROR: Collection associations were not deleted!');
      } else {
        console.log('✅ Success: Collection associations were deleted successfully');
      }
    }
    
    console.log('Test completed!');
  } catch (error) {
    console.error('Error running test:', error);
  }
}

// Run the test
testVideoDelete().catch(console.error);