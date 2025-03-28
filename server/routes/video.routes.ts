import { Router, Request, Response } from 'express';
import { ZodError, z } from 'zod';
import { dbStorage } from '../database-storage';
import { validateParams } from '../middleware/validation.middleware';
import { authenticateUser, requireAuth, requireSession, getUserInfo } from '../middleware/auth.middleware';
import { 
  youtubeUrlSchema,
  videoMetadataSchema,
  searchParamsSchema,
  SearchParams
} from '../../shared/schema';
import { apiSuccess as sendSuccess, apiError as sendError } from '../utils/response.utils';
import errorUtils from '../utils/error.utils';
const { AnonymousLimitError, ErrorCode } = errorUtils;
// No separate processor service, processYoutubeVideo is part of YouTube service
import { 
  getYoutubeTranscript, 
  generateTranscriptSummary,
  extractYoutubeId,
  processYoutubeVideo
} from '../services/youtube';
import { 
  processTranscriptEmbeddings,
  processSummaryEmbeddings,
  deleteVideoEmbeddings
} from '../services/embeddings';

// Create router
const router = Router();

// Apply authentication and user info middleware to all routes
router.use(authenticateUser);
router.use(getUserInfo); // This middleware sets res.locals.userInfo

/**
 * Get the count of videos for an anonymous session
 * This endpoint must be placed BEFORE the /:id route to avoid being captured as an ID parameter
 */
router.get('/anonymous/count', async (req: Request, res: Response) => {
  try {
    // Get the anonymous session ID from the request header
    const sessionHeader = req.headers['x-anonymous-session'];
    
    console.log('[video routes] Anonymous session header:', sessionHeader);
    
    if (!sessionHeader) {
      console.log('[video routes] No anonymous session header found');
      return sendSuccess(res, { count: 0 });
    }
    
    const sessionId = Array.isArray(sessionHeader) ? sessionHeader[0] : sessionHeader;
    console.log('[video routes] Looking up session:', sessionId);
    
    const session = await dbStorage.getAnonymousSessionBySessionId(sessionId as string);
    
    if (!session) {
      console.log('[video routes] No session found for ID:', sessionId);
      // Create the session if it doesn't exist
      try {
        const newSession = await dbStorage.createAnonymousSession({
          session_id: sessionId as string,
          user_agent: req.headers['user-agent'] || null,
          ip_address: req.ip || null
        });
        console.log('[video routes] Created new anonymous session:', newSession);
        return sendSuccess(res, { count: 0 });
      } catch (err) {
        console.error('[video routes] Error creating anonymous session:', err);
        return sendSuccess(res, { count: 0 });
      }
    }
    
    console.log('[video routes] Found session with video count:', session.video_count);
    return sendSuccess(res, { 
      count: session.video_count || 0,
      max_allowed: 3 
    });
  } catch (error) {
    console.error("Error getting anonymous video count:", error);
    return sendError(res, "Failed to get video count", 500);
  }
});

/**
 * Process a video from the front end - root /api/videos endpoint
 * This is to handle the client's POST request to /api/videos
 */
router.post('/', requireSession, async (req: Request, res: Response) => {
  try {
    // Get user information from middleware
    const userInfo = res.locals.userInfo;
    console.log("[video routes] Processing video (POST /) for user:", 
      userInfo.user_id, 
      "anonymous:", userInfo.is_anonymous, 
      "session:", userInfo.anonymous_session_id
    );
    
    // Debug all headers to help diagnose session issues
    console.log("[video routes] REQUEST HEADERS:", JSON.stringify(req.headers, null, 2));
    
    // Debug incoming headers
    console.log("[video routes] Request headers:", {
      'x-user-id': req.headers['x-user-id'],
      'x-anonymous-session': req.headers['x-anonymous-session'],
      'content-type': req.headers['content-type']
    });
    
    // For anonymous users, check if they've reached the limit
    if (userInfo.is_anonymous && userInfo.anonymous_session_id) {
      // Get current video count for this anonymous session
      const session = await dbStorage.getAnonymousSessionBySessionId(userInfo.anonymous_session_id);
      
      // Log session info for debugging
      console.log("[video routes] Anonymous session info:", session);
      
      // Check if session has video count attribute
      if (session && session.video_count && session.video_count >= 3) {
        return sendError(res, 
          "Anonymous users can only save up to 3 videos. Please sign in to save more.", 
          403, 
          "ANONYMOUS_LIMIT_REACHED"
        );
      }
    }
    
    // Extract the data from the request
    const {
      youtubeId,
      title,
      channel,
      duration,
      publishDate,
      thumbnail,
      transcript,
      summary,
      viewCount,
      likeCount,
      description,
      tags,
      notes,
      category_id,
      rating,
      is_favorite
    } = req.body;

    // Create the video in the database
    // Extract just the YouTube ID from the URL (if it's a URL)
    const extractedId = extractYoutubeId(youtubeId);
    const video = await dbStorage.insertVideo({
      youtube_id: extractedId || youtubeId || '',
      title,
      channel,
      duration,
      publish_date: publishDate,
      thumbnail,
      transcript,
      summary,
      views: viewCount,
      likes: likeCount,
      description,
      tags,
      user_id: userInfo.is_anonymous ? 1 : (userInfo.user_id as number), // Use user_id=1 for anonymous users
      anonymous_session_id: userInfo.is_anonymous ? userInfo.anonymous_session_id : null,
      notes,
      category_id,
      rating,
      is_favorite
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
    const parsedQuery: Record<string, any> = { ...req.query };
    
    // Handle empty string values
    Object.keys(parsedQuery).forEach(key => {
      if (parsedQuery[key] === '') {
        delete parsedQuery[key]; // Remove empty string values
      }
    });
    
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
      try {
        console.log("[video routes] Retrieving videos for anonymous session:", userInfo.anonymous_session_id);
        // For anonymous users with session, search their videos
        const videos = await dbStorage.getVideosByAnonymousSessionId(userInfo.anonymous_session_id);
        console.log("[video routes] Found", videos.length, "videos for anonymous session");
        
        // For anonymous users, skip Zod validation and manually handle search parameters
        // to avoid type conversion issues
        let filteredVideos = videos;
        
        // Apply simple filters manually instead of using searchParams
        if (req.query.query) {
          const searchTerm = String(req.query.query).toLowerCase();
          filteredVideos = filteredVideos.filter(v => 
            v.title.toLowerCase().includes(searchTerm) || 
            v.channel.toLowerCase().includes(searchTerm) ||
            (v.transcript && v.transcript.toLowerCase().includes(searchTerm))
          );
        }
        
        if (req.query.is_favorite === 'true') {
          filteredVideos = filteredVideos.filter(v => v.is_favorite);
        }
        
        // Apply category filter
        if (req.query.category_id) {
          const categoryId = Number(req.query.category_id);
          filteredVideos = filteredVideos.filter(v => v.category_id === categoryId);
        }
        
        // Apply sorting
        const sortBy = req.query.sort_by as string || 'date';
        const sortOrder = req.query.sort_order as string || 'desc';
        
        filteredVideos.sort((a, b) => {
          if (sortBy === 'title') {
            return sortOrder === 'asc' 
              ? a.title.localeCompare(b.title)
              : b.title.localeCompare(a.title);
          } else if (sortBy === 'rating') {
            const ratingA = a.rating || 0;
            const ratingB = b.rating || 0;
            return sortOrder === 'asc' ? ratingA - ratingB : ratingB - ratingA;
          } else {
            // Default: sort by date
            const dateA = new Date(a.created_at).getTime();
            const dateB = new Date(b.created_at).getTime();
            return sortOrder === 'asc' ? dateA - dateB : dateB - dateA;
          }
        });
        
        console.log("[video routes] Returning", filteredVideos.length, "filtered videos for anonymous user");
        return sendSuccess(res, {
          videos: filteredVideos,
          totalCount: filteredVideos.length,
          hasMore: false
        });
      } catch (error) {
        console.error("[video routes] Error processing anonymous videos:", error);
        return sendError(res, "Failed to process videos for anonymous user", 500);
      }
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
 * Analyze a YouTube video URL without saving it
 */
router.post('/analyze', async (req: Request, res: Response) => {
  try {
    // Validate YouTube URL
    const { url } = youtubeUrlSchema.parse(req.body);
    
    // Extract video ID from URL
    const videoId = extractYoutubeId(url);
    if (!videoId) {
      return sendError(res, "Invalid YouTube URL format", 400, "VALIDATION_ERROR");
    }
    
    // Process the YouTube video without saving
    const videoData = await processYoutubeVideo(videoId);
    
    // Return the processed video data
    return sendSuccess(res, videoData);
  } catch (error) {
    if (error instanceof ZodError) {
      return sendError(res, error.errors[0].message, 400, "VALIDATION_ERROR");
    }
    console.error("Error analyzing video:", error);
    return sendError(res, "Failed to analyze video", 500);
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
    
    // Debug all headers to help diagnose session issues
    console.log("[video routes] REQUEST HEADERS FOR /process:", JSON.stringify(req.headers, null, 2));
    
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
    // Extract just the YouTube ID from the URL (if it's a URL)
    const extractedId = extractYoutubeId(videoData.youtubeId);
    const video = await dbStorage.insertVideo({
      youtube_id: extractedId || videoData.youtubeId || '',
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
 * Bulk delete videos
 */
router.delete('/bulk', async (req: Request, res: Response) => {
  try {
    const { ids } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return sendError(res, "Video IDs array is required", 400, "VALIDATION_ERROR");
    }

    // Convert IDs to numbers (in case they're passed as strings)
    const numericIds = ids.map(id => Number(id));
    
    // Validate that all IDs are valid numbers
    if (numericIds.some(id => isNaN(id) || id <= 0)) {
      return sendError(res, "Invalid video IDs. All IDs must be positive numbers.", 400, "VALIDATION_ERROR");
    }

    // Delete embeddings first
    for (const id of numericIds) {
      try {
        // Try to delete video embeddings, but continue even if this fails
        // This ensures the video deletion can still proceed
        await deleteVideoEmbeddings(id);
      } catch (error) {
        console.error(`Error deleting embeddings for video ${id}:`, error);
        // We continue with the deletion even if embeddings deletion fails
      }
    }

    // Bulk delete videos
    const deletedCount = await dbStorage.bulkDeleteVideos(numericIds);

    return sendSuccess(res, { count: deletedCount });
  } catch (error) {
    console.error("Error bulk deleting videos:", error);
    return sendError(res, "Failed to delete videos", 500);
  }
});

/**
 * Get a single video by ID
 * This route MUST be placed after all other GET routes with specific paths
 * as Express will match '/:id' for ANY path segment if placed earlier
 */
router.get('/:id', validateParams(z.object({ id: z.string().regex(/^\d+$/) })), async (req: Request, res: Response) => {
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
 * Update a video
 */
router.patch('/:id', validateParams(z.object({ id: z.string().regex(/^\d+$/) })), async (req: Request, res: Response) => {
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
router.delete('/:id', validateParams(z.object({ id: z.string().regex(/^\d+$/) })), async (req: Request, res: Response) => {
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

export default router;