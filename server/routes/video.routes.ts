import { Router, Request, Response } from 'express';
import { ZodError } from 'zod';
import { dbStorage } from '../database-storage';
import { validateRequest, validateNumericParam } from '../middleware/validation.middleware';
import { getUserInfo, requireAuth, requireSession } from '../middleware/auth.middleware';
import { 
  videoMetadataSchema, 
  searchParamsSchema, 
  youtubeUrlSchema 
} from '../../shared/schema';
import { applySearchFilters } from '../utils/query-parser';
import { sendSuccess, sendError } from '../utils/response.utils';
import { 
  processYoutubeVideo, 
  getYoutubeTranscript, 
  generateTranscriptSummary 
} from '../services/youtube';
import { 
  processTranscriptEmbeddings,
  processSummaryEmbeddings
} from '../services/embeddings';

// Create router
const router = Router();

// Apply user info middleware to all routes
router.use(getUserInfo);

/**
 * Debug endpoint for logging request information
 * Useful for debugging issues with headers or cookies
 */
router.get('/debug-info', (req: Request, res: Response) => {
  console.log("================================================");
  console.log("🔴 VIDEO DEBUG INFO 🔴");
  console.log("================================================");
  console.log(`Received ${req.method} ${req.path} request at ${new Date().toISOString()}`);
  console.log("Request query params:", req.query);
  console.log("Request cookies:", req.cookies);
  console.log("Request headers:", req.headers);
  console.log("User info:", res.locals.userInfo);
  
  return res.status(200).json({
    message: "Debug info logged to console",
    userInfo: res.locals.userInfo,
    query: req.query,
    headers: req.headers
  });
});

/**
 * Get all videos with optional filtering
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    console.log("================================================");
    console.log("🔴 VIDEO FETCH REQUEST STARTING 🔴");
    console.log("================================================");
    console.log(`Received ${req.method} ${req.path} request at ${new Date().toISOString()}`);
    console.log("Request query params:", req.query);
    
    // Get user info from middleware
    const userInfo = res.locals.userInfo;
    console.log("================================================");
    console.log("🔑 User info extracted from request:", {
      user_id: userInfo.user_id,
      is_anonymous: userInfo.is_anonymous
    });
    console.log("================================================");
    console.log("Request headers for GET /api/videos:", req.headers);
    
    // Convert string parameters to appropriate types before parsing
    const parsedQuery = { ...req.query };
    
    // Convert numeric parameters from strings to numbers
    if (parsedQuery.category_id) parsedQuery.category_id = Number(parsedQuery.category_id);
    if (parsedQuery.collection_id) parsedQuery.collection_id = Number(parsedQuery.collection_id);
    if (parsedQuery.rating_min) parsedQuery.rating_min = Number(parsedQuery.rating_min);
    if (parsedQuery.rating_max) parsedQuery.rating_max = Number(parsedQuery.rating_max);
    if (parsedQuery.page) parsedQuery.page = Number(parsedQuery.page);
    if (parsedQuery.limit) parsedQuery.limit = Number(parsedQuery.limit);
    if (parsedQuery.cursor) parsedQuery.cursor = Number(parsedQuery.cursor);
    
    // Convert string boolean to actual boolean
    if (parsedQuery.is_favorite === 'true') parsedQuery.is_favorite = true;
    if (parsedQuery.is_favorite === 'false') parsedQuery.is_favorite = false;
    
    // Now parse with the schema
    const searchParams = searchParamsSchema.parse(parsedQuery);
    
    // Check if the request is for the count only
    if (req.query._countOnly === 'true') {
      // If we're looking for the count of all videos, we can optimize this
      if (userInfo.is_anonymous && userInfo.anonymous_session_id) {
        // For anonymous users with session, return count of their videos
        const videos = await dbStorage.getVideosByAnonymousSessionId(userInfo.anonymous_session_id);
        return sendSuccess(res, { count: videos.length });
      } else if (userInfo.user_id !== null) {
        // For authenticated users, get count of their videos
        const videos = await dbStorage.getVideosByUserId(userInfo.user_id);
        return sendSuccess(res, { count: videos.length });
      } else {
        // No user ID and no anonymous session
        return sendSuccess(res, { count: 0 });
      }
    }
    
    // Handle anonymous users with session
    if (userInfo.is_anonymous && userInfo.anonymous_session_id) {
      // For anonymous users with session, search their videos
      const videos = await dbStorage.getVideosByAnonymousSessionId(userInfo.anonymous_session_id);
      // Filter these videos based on the search parameters
      const filteredVideos = applySearchFilters(videos, searchParams);
      
      return sendSuccess(res, {
        videos: filteredVideos,
        totalCount: filteredVideos.length,
        hasMore: false
      });
    } 
    // Handle authenticated users
    else if (userInfo.user_id !== null) {
      if (Object.keys(req.query).length > 0) {
        const result = await dbStorage.searchVideos(userInfo.user_id, searchParams);
        return sendSuccess(res, result);
      } else {
        const videos = await dbStorage.getVideosByUserId(userInfo.user_id);
        return sendSuccess(res, {
          videos,
          totalCount: videos.length,
          hasMore: false
        });
      }
    } 
    // No user ID and no anonymous session
    else {
      return sendSuccess(res, {
        videos: [],
        totalCount: 0,
        hasMore: false
      });
    }
  } catch (error) {
    if (error instanceof ZodError) {
      return sendError(res, error.errors[0].message, 400, "VALIDATION_ERROR");
    }
    console.error("Error fetching videos:", error);
    return sendError(res, "Failed to fetch videos", 500);
  }
});

/**
 * Get a single video by ID
 */
router.get('/:id', validateNumericParam('id'), async (req: Request, res: Response) => {
  try {
    const videoId = parseInt(req.params.id);
    
    const video = await dbStorage.getVideo(videoId);
    if (!video) {
      return sendError(res, "Video not found", 404, "NOT_FOUND");
    }

    return sendSuccess(res, video);
  } catch (error) {
    console.error("Error fetching video:", error);
    return sendError(res, "Failed to fetch video", 500);
  }
});

/**
 * Process a YouTube video URL and save it
 */
router.post('/process', requireSession, async (req: Request, res: Response) => {
  try {
    // Validate YouTube URL
    const { url } = youtubeUrlSchema.parse(req.body);
    
    // Get user information from middleware
    const userInfo = res.locals.userInfo;
    console.log("[video routes] Processing video for user:", 
      userInfo.user_id, 
      "anonymous:", userInfo.is_anonymous, 
      "session:", userInfo.anonymous_session_id
    );
    
    // For anonymous users, check if they've reached the limit
    if (userInfo.is_anonymous && userInfo.anonymous_session_id) {
      // Get current video count for this anonymous session
      const session = await dbStorage.getAnonymousSessionBySessionId(userInfo.anonymous_session_id);
      
      // Check if session has video count attribute
      if (session && session.video_count && session.video_count >= 3) {
        return sendError(res, 
          "Anonymous users can only save up to 3 videos. Please sign in to save more.", 
          403, 
          "ANONYMOUS_LIMIT_REACHED"
        );
      }
    }
    
    // Process the YouTube video
    const videoData = await processYoutubeVideo(url);
    
    // Create the video in the database
    const video = await dbStorage.insertVideo({
      youtube_id: videoData.youtubeId,
      title: videoData.title,
      channel: videoData.channel,
      duration: videoData.duration,
      publish_date: videoData.publishDate,
      thumbnail: videoData.thumbnail,
      transcript: videoData.transcript,
      summary: videoData.summary,
      views: videoData.viewCount,
      likes: videoData.likeCount,
      description: videoData.description,
      tags: videoData.tags,
      user_id: userInfo.is_anonymous ? 1 : (userInfo.user_id as number), // Use user_id=1 for anonymous users
      anonymous_session_id: userInfo.is_anonymous ? userInfo.anonymous_session_id : null
    });
    
    console.log("🔍 Saved with user_id:", video.user_id);
    
    // For anonymous users, increment their video count
    if (userInfo.is_anonymous && userInfo.anonymous_session_id) {
      await dbStorage.incrementAnonymousSessionVideoCount(userInfo.anonymous_session_id);
    }
    
    // Process embeddings for transcript and summary if available
    if (video.transcript) {
      await processTranscriptEmbeddings(
        video.id,
        video.user_id,
        video.transcript
      );
    }
    
    if (video.summary) {
      await processSummaryEmbeddings(
        video.id,
        video.user_id,
        video.summary
      );
    }
    
    // Return the processed video data
    return sendSuccess(res, { 
      message: "Video processed successfully", 
      video 
    }, 201);
  } catch (error) {
    if (error instanceof ZodError) {
      return sendError(res, error.errors[0].message, 400, "VALIDATION_ERROR");
    }
    console.error("Error processing video:", error);
    return sendError(res, "Failed to process video", 500);
  }
});

/**
 * Update a video
 */
router.patch('/:id', validateNumericParam('id'), async (req: Request, res: Response) => {
  try {
    const videoId = parseInt(req.params.id);
    const metadata = videoMetadataSchema.parse(req.body);

    const updatedVideo = await dbStorage.updateVideo(videoId, {
      notes: metadata.notes,
      category_id: metadata.category_id,
      rating: metadata.rating,
      is_favorite: metadata.is_favorite,
      timestamps: metadata.timestamps
    });

    if (!updatedVideo) {
      return sendError(res, "Video not found", 404, "NOT_FOUND");
    }

    // If collections were specified, handle collection membership changes
    if (metadata.collection_ids && metadata.collection_ids.length > 0) {
      // For now, just add to the first collection specified
      // In a full implementation, we'd handle removing from other collections
      await dbStorage.bulkAddVideosToCollection(metadata.collection_ids[0], [videoId]);
    }

    return sendSuccess(res, updatedVideo);
  } catch (error) {
    if (error instanceof ZodError) {
      return sendError(res, error.errors[0].message, 400, "VALIDATION_ERROR");
    }
    console.error("Error updating video:", error);
    return sendError(res, "Failed to update video", 500);
  }
});

/**
 * Delete a video
 */
router.delete('/:id', validateNumericParam('id'), async (req: Request, res: Response) => {
  try {
    const videoId = parseInt(req.params.id);
    
    const deleted = await dbStorage.deleteVideo(videoId);
    if (!deleted) {
      return sendError(res, "Video not found", 404, "NOT_FOUND");
    }

    return res.status(204).end();
  } catch (error) {
    console.error("Error deleting video:", error);
    return sendError(res, "Failed to delete video", 500);
  }
});

/**
 * Bulk update videos
 */
router.patch('/', async (req: Request, res: Response) => {
  try {
    const { ids, ...updates } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return sendError(res, "Video IDs array is required", 400, "VALIDATION_ERROR");
    }

    const metadata = videoMetadataSchema.parse(updates);

    const updateData: any = {
      notes: metadata.notes,
      category_id: metadata.category_id,
      rating: metadata.rating,
      is_favorite: metadata.is_favorite,
      timestamps: metadata.timestamps
    };

    // Remove undefined values
    Object.keys(updateData).forEach(key => {
      if (updateData[key] === undefined) {
        delete updateData[key];
      }
    });

    // Bulk update videos
    const updatedCount = await dbStorage.bulkUpdateVideos(ids, updateData);

    // If collections were specified, add all videos to those collections
    if (metadata.collection_ids && metadata.collection_ids.length > 0) {
      await dbStorage.bulkAddVideosToCollection(metadata.collection_ids[0], ids);
    }

    return sendSuccess(res, { count: updatedCount });
  } catch (error) {
    if (error instanceof ZodError) {
      return sendError(res, error.errors[0].message, 400, "VALIDATION_ERROR");
    }
    console.error("Error bulk updating videos:", error);
    return sendError(res, "Failed to update videos", 500);
  }
});

/**
 * Get the count of videos for an anonymous session
 */
router.get('/anonymous/count', async (req: Request, res: Response) => {
  try {
    // Get the anonymous session ID from the request header
    const sessionHeader = req.headers['x-anonymous-session'];
    if (!sessionHeader) {
      return sendSuccess(res, { count: 0 });
    }
    
    const sessionId = Array.isArray(sessionHeader) ? sessionHeader[0] : sessionHeader;
    const session = await dbStorage.getAnonymousSessionBySessionId(sessionId as string);
    
    if (!session) {
      return sendSuccess(res, { count: 0 });
    }
    
    return sendSuccess(res, { count: session.video_count || 0 });
  } catch (error) {
    console.error("Error getting anonymous video count:", error);
    return sendError(res, "Failed to get video count", 500);
  }
});

export default router;