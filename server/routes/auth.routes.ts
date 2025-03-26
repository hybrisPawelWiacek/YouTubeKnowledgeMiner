import { Router, Request, Response } from 'express';
import { storage } from '../storage';
import { getUserInfoFromRequest } from '../middleware/auth.middleware';
import { sendSuccess, sendError } from '../utils/response.utils';

const router = Router();

/**
 * Get the count of videos for an anonymous session
 */
router.get("/videos/count", async (req: Request, res: Response) => {
  try {
    // Get session ID from header
    const sessionHeader = req.headers['x-anonymous-session'];
    if (!sessionHeader) {
      return sendSuccess(res, { count: 0 });
    }
    
    const sessionId = Array.isArray(sessionHeader) ? sessionHeader[0] : sessionHeader as string;
    
    // Get session from database
    const session = await storage.getAnonymousSessionBySessionId(sessionId);
    
    if (!session) {
      return sendSuccess(res, { count: 0 });
    }
    
    // Update last active timestamp for the session
    await storage.updateAnonymousSessionLastActive(sessionId);
    
    return sendSuccess(res, { 
      count: session.video_count,
      session_id: sessionId,
      max_allowed: 3 // Hard-coded limit for now, could move to config
    });
  } catch (error) {
    console.error("Error getting anonymous video count:", error);
    return sendError(res, "Failed to get anonymous video count", 500);
  }
});

/**
 * Migrate videos from anonymous session to authenticated user
 * Used when a user registers after using the app anonymously
 */
router.post("/migrate", async (req: Request, res: Response) => {
  try {
    // Get session ID from header
    const sessionHeader = req.headers['x-anonymous-session'];
    if (!sessionHeader) {
      return sendError(res, "No anonymous session ID provided", 400);
    }
    
    const sessionId = Array.isArray(sessionHeader) ? sessionHeader[0] : sessionHeader as string;
    const { userId } = req.body;
    
    if (!userId || typeof userId !== 'number') {
      return sendError(res, "Invalid user ID provided", 400);
    }
    
    // Get videos attached to this anonymous session
    const anonymousVideos = await storage.getVideosByAnonymousSessionId(sessionId);
    
    if (!anonymousVideos || anonymousVideos.length === 0) {
      return sendSuccess(res, { message: "No videos to migrate", migratedCount: 0 });
    }
    
    // Update the user_id on all these videos
    let migratedCount = 0;
    for (const video of anonymousVideos) {
      await storage.updateVideo(video.id, { user_id: userId });
      migratedCount++;
    }
    
    console.log(`Successfully migrated ${migratedCount} videos from anonymous session ${sessionId} to user ${userId}`);
    
    return sendSuccess(res, { 
      message: "Videos successfully migrated", 
      migratedCount,
      sessionId
    });
  } catch (error) {
    console.error("Error migrating anonymous session:", error);
    return sendError(res, "Failed to migrate anonymous session", 500);
  }
});

/**
 * Legacy endpoint to import anonymous data from local storage
 * This is kept for backward compatibility with older clients
 */
router.post("/import-data", async (req: Request, res: Response) => {
  try {
    const { userData, userId } = req.body;
    
    if (!userData || !userId) {
      return sendError(res, "Missing user data or user ID", 400);
    }
    
    let importedCount = 0;
    
    // Process videos if they exist
    if (userData.videos && Array.isArray(userData.videos)) {
      for (const video of userData.videos) {
        if (video && video.youtube_id) {
          try {
            // Check if this video already exists for this user
            const existingVideos = await storage.searchVideos(userId, {
              query: video.youtube_id, // Use the query parameter instead of youtube_id directly
              limit: 1,
              page: 1
            });
            
            if (existingVideos && existingVideos.videos.length === 0) {
              // Create a new video entry
              await storage.insertVideo({
                youtube_id: video.youtube_id,
                title: video.title || 'Imported Video',
                channel: video.channel || 'Unknown Channel',
                duration: video.duration || '0:00',
                publish_date: video.publish_date || new Date().toISOString(),
                thumbnail: video.thumbnail || '',
                transcript: video.transcript || null,
                summary: video.summary || null,
                description: video.description || null,
                tags: video.tags || null,
                user_id: userId,
                notes: video.notes || null,
                category_id: video.category_id || null,
                rating: video.rating || null,
                is_favorite: video.is_favorite || false
              });
              
              importedCount++;
            }
          } catch (videoError) {
            console.error(`Error importing video ${video.youtube_id}:`, videoError);
            // Continue with other videos even if one fails
          }
        }
      }
    }
    
    return sendSuccess(res, {
      message: `Successfully imported ${importedCount} videos`,
      importedCount
    });
  } catch (error) {
    console.error("Error importing anonymous data:", error);
    return sendError(res, "Failed to import anonymous data", 500);
  }
});

export default router;