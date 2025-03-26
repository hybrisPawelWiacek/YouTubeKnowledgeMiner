
import { db } from '../server/db';
import { videos } from '../shared/schema';

async function listVideos() {
  try {
    console.log('Fetching all videos from database...');
    const allVideos = await db.select().from(videos);
    
    console.log(`Found ${allVideos.length} videos in database`);
    
    allVideos.forEach(video => {
      console.log(`ID: ${video.id}, Title: ${video.title}, User ID: ${video.user_id}`);
    });
    
    // Group by user_id
    const videosByUser = allVideos.reduce((acc, video) => {
      const userId = video.user_id;
      if (!acc[userId]) {
        acc[userId] = [];
      }
      acc[userId].push(video);
      return acc;
    }, {});
    
    console.log('\nVideos by User ID:');
    Object.entries(videosByUser).forEach(([userId, userVideos]) => {
      console.log(`User ID ${userId}: ${userVideos.length} videos`);
    });
    
  } catch (error) {
    console.error('Error fetching videos:', error);
  } finally {
    process.exit(0);
  }
}

listVideos();
