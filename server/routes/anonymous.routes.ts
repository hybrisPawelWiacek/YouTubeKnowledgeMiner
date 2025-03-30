import { Router, Request, Response } from 'express';
import { dbStorage } from '../database-storage';
import { sendSuccess, sendError } from '../utils/response.utils';
import { createLogger } from '../services/logger';

const router = Router();
const logger = createLogger('anonymous');
const ANONYMOUS_VIDEO_LIMIT = 3; // Maximum videos allowed per anonymous session

/**
 * Get video count for anonymous session
 * This endpoint returns the number of videos in an anonymous session
 * It also returns the maximum allowed videos for anonymous users
 */
router.get('/videos/count', async (req: Request, res: Response) => {
  try {
    // Get session ID from header
    const sessionHeader = req.headers['x-anonymous-session'];
    if (!sessionHeader) {
      return sendSuccess(res, { count: 0, max_allowed: ANONYMOUS_VIDEO_LIMIT });
    }
    
    const sessionId = Array.isArray(sessionHeader) ? sessionHeader[0] : sessionHeader as string;
    
    // Get session from database
    const session = await dbStorage.getAnonymousSessionBySessionId(sessionId);
    
    if (!session) {
      logger.info(`Anonymous session not found: ${sessionId}`);
      return sendSuccess(res, { count: 0, max_allowed: ANONYMOUS_VIDEO_LIMIT });
    }
    
    // Update last active timestamp for the session
    await dbStorage.updateAnonymousSessionLastActive(sessionId);
    
    logger.info(`Found session with video count: ${session.video_count}`);
    return sendSuccess(res, { 
      count: session.video_count || 0,
      session_id: sessionId,
      max_allowed: ANONYMOUS_VIDEO_LIMIT
    });
  } catch (error) {
    logger.error("Error getting anonymous video count:", error);
    return sendError(res, "Failed to get anonymous video count");
  }
});

/**
 * Migration endpoint to move videos from anonymous session to authenticated user
 * This endpoint is called when an anonymous user registers and wants to keep their videos
 */
router.post('/migrate', async (req: Request, res: Response) => {
  try {
    // This endpoint requires authentication middleware
    if (!req.user || !req.user.id) {
      return sendError(res, 'Authentication required', 401);
    }

    // Get session ID from header or body
    const sessionId = req.body.sessionId || 
                     (req.headers['x-anonymous-session'] ? 
                     (Array.isArray(req.headers['x-anonymous-session']) ? 
                      req.headers['x-anonymous-session'][0] : 
                      req.headers['x-anonymous-session']) : 
                     null);

    if (!sessionId) {
      return sendError(res, 'Anonymous session ID is required', 400);
    }
    
    // Get the user ID from the authenticated request
    const userId = req.user.id;
    
    // Check if the anonymous session exists
    const session = await dbStorage.getAnonymousSessionBySessionId(sessionId);
    if (!session) {
      return sendError(res, 'Anonymous session not found', 404);
    }
    
    // Get videos from the anonymous session
    const videos = await dbStorage.getVideosByAnonymousSessionId(sessionId);
    if (!videos.length) {
      return sendSuccess(res, { 
        success: true, 
        message: 'No videos to migrate', 
        data: { migratedVideos: 0 } 
      });
    }
    
    // Update each video to be associated with the authenticated user
    let migratedCount = 0;
    for (const video of videos) {
      try {
        await dbStorage.updateVideo(video.id, { user_id: userId, anonymous_session_id: null });
        migratedCount++;
      } catch (err) {
        logger.error(`Failed to migrate video ${video.id}:`, err);
      }
    }
    
    // Clear the anonymous session's video count
    await dbStorage.updateAnonymousSession(sessionId, { video_count: 0 });
    
    return sendSuccess(res, { 
      success: true, 
      message: `Successfully migrated ${migratedCount} videos`, 
      data: { migratedVideos: migratedCount } 
    });
  } catch (error) {
    logger.error("Error migrating anonymous data:", error);
    return sendError(res, "Failed to migrate anonymous user data");
  }
});

export default router;