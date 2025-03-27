
import { db } from '../server/db';
import { videos, embeddings, collection_videos, qa_conversations } from '../shared/schema';
import { eq } from 'drizzle-orm';

async function deleteVideoByYoutubeId(youtubeId: string) {
  try {
    console.log(`Looking for video with YouTube ID: ${youtubeId}`);
    
    // First, find the video ID in the database
    const videoResults = await db.select({ id: videos.id })
      .from(videos)
      .where(eq(videos.youtube_id, youtubeId));
    
    if (videoResults.length === 0) {
      console.log(`No video found with YouTube ID: ${youtubeId}`);
      return;
    }
    
    const videoId = videoResults[0].id;
    console.log(`Found video with ID: ${videoId}`);
    
    // Begin deletion process for related tables
    
    // 1. Delete embeddings that reference this video
    const deletedEmbeddings = await db.delete(embeddings)
      .where(eq(embeddings.video_id, videoId))
      .returning();
    console.log(`Deleted ${deletedEmbeddings.length} embeddings`);
    
    // 2. Delete collection_videos entries that reference this video
    const deletedCollectionVideos = await db.delete(collection_videos)
      .where(eq(collection_videos.video_id, videoId))
      .returning();
    console.log(`Removed video from ${deletedCollectionVideos.length} collections`);
    
    // 3. Delete QA conversations for this video
    const deletedQAConversations = await db.delete(qa_conversations)
      .where(eq(qa_conversations.video_id, videoId))
      .returning();
    console.log(`Deleted ${deletedQAConversations.length} Q&A conversations`);
    
    // 4. Finally delete the video itself
    const deletedVideo = await db.delete(videos)
      .where(eq(videos.id, videoId))
      .returning();
    
    if (deletedVideo.length > 0) {
      console.log(`Successfully deleted video with ID ${videoId} (YouTube ID: ${youtubeId})`);
      console.log(deletedVideo[0]);
    } else {
      console.log(`Failed to delete video with ID ${videoId}`);
    }
    
  } catch (error) {
    console.error('Error deleting video:', error);
  } finally {
    process.exit(0);
  }
}

// Get the YouTube ID from command line arguments
const youtubeId = process.argv[2];

if (!youtubeId) {
  console.error('Please provide a YouTube ID as a command line argument');
  console.error('Usage: npx tsx scripts/delete-video.ts <youtube_id>');
  process.exit(1);
}

// Execute the function with the provided YouTube ID
deleteVideoByYoutubeId(youtubeId);
