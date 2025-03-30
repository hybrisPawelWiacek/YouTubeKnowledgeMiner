import { Router, Request, Response } from 'express';
import { dbStorage } from '../database-storage';
import { sendSuccess, sendError } from '../utils/response.utils';
import { createLogger } from '../services/logger';
import { isPromiseLike } from '../../shared/promise-utils';
import { SYSTEM } from '../../shared/config';

const router = Router();
const logger = createLogger('anonymous');
const ANONYMOUS_VIDEO_LIMIT = SYSTEM.ANONYMOUS_VIDEO_LIMIT; // Maximum videos allowed per anonymous session

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
    
    // Ensure we're working with a string, not a Promise object
    // First handle if it's an array or single value
    let rawSessionId = Array.isArray(sessionHeader) ? sessionHeader[0] : sessionHeader;
    
    // Then ensure it's a string
    let sessionId: string;
    
    // Using the shared isPromiseLike function
    
    if (isPromiseLike(rawSessionId)) {
      logger.info(`Session ID is a Promise-like object, resolving...`);
      try {
        sessionId = await rawSessionId;
      } catch (err) {
        logger.error(`Failed to resolve session ID Promise:`, err);
        return sendSuccess(res, { count: 0, max_allowed: ANONYMOUS_VIDEO_LIMIT });
      }
    } else {
      sessionId = rawSessionId as string;
    }
    
    // Log for debugging
    logger.info(`Processing anonymous session request for ID: ${sessionId}`);
    
    // Get session from database
    const session = await dbStorage.getAnonymousSessionBySessionId(sessionId);
    
    if (!session) {
      logger.info(`Anonymous session not found: ${sessionId}`);
      return sendSuccess(res, { count: 0, max_allowed: ANONYMOUS_VIDEO_LIMIT });
    }
    
    // Update last active timestamp for the session
    await dbStorage.updateAnonymousSessionLastActive(sessionId);
    
    // Get the actual video count from the database for accuracy
    const actualVideos = await dbStorage.getVideosByAnonymousSessionId(sessionId);
    const actualCount = actualVideos.length;
    
    // If the counts don't match, update the session with the correct count
    if (session.video_count !== actualCount) {
      logger.info(`[Count Mismatch] Session ${sessionId} has counter=${session.video_count} but actual=${actualCount} videos. Fixing...`);
      await dbStorage.updateAnonymousSession(sessionId, { video_count: actualCount });
      logger.info(`Updated session counter to match actual video count: ${actualCount}`);
    }
    
    logger.info(`Found session with video count: ${actualCount} (from DB query)`);
    return sendSuccess(res, { 
      count: actualCount,
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
    let rawSessionId = req.body.sessionId || 
                     (req.headers['x-anonymous-session'] ? 
                     (Array.isArray(req.headers['x-anonymous-session']) ? 
                      req.headers['x-anonymous-session'][0] : 
                      req.headers['x-anonymous-session']) : 
                     null);

    if (!rawSessionId) {
      return sendError(res, 'Anonymous session ID is required', 400);
    }
    
    // Resolve session ID if it's a Promise-like object
    let sessionId: string;
    
    // Using the shared isPromiseLike function
      
    if (isPromiseLike(rawSessionId)) {
      logger.info(`Migrate: Session ID is a Promise-like object, resolving...`);
      try {
        sessionId = await rawSessionId;
      } catch (err) {
        logger.error(`Migrate: Failed to resolve session ID Promise:`, err);
        return sendError(res, 'Invalid anonymous session ID', 400);
      }
    } else {
      sessionId = rawSessionId as string;
    }
    
    // Log the sessionId for debugging
    logger.info(`Processing migration request for session: ${sessionId}`);
    
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