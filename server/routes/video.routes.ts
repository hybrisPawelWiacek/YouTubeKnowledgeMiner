import { Router, Request, Response } from 'express';
import { ZodError } from 'zod';
import { dbStorage } from '../database-storage';
import { validateRequest, validateNumericParam } from '../middleware/validation.middleware';
import { requireAuth, requireAnyUser } from '../middleware/auth.middleware';
import { 
  youtubeUrlSchema,
  videoMetadataSchema,
  searchParamsSchema,
  SearchParams
} from '../../shared/schema';
import { sendSuccess, sendError, handleApiError } from '../utils/response.utils';
import { AnonymousLimitError, ErrorCode } from '../utils/error.utils';
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

/**
 * Helper function to get user information from request object
 * This function adapts the new auth middleware format to the existing code
 */
function getUserInfoFromRequest(req: Request) {
  // First check if the user is authenticated
  if (req.isAuthenticated && req.user) {
    // For authenticated users, return user ID, ignore anonymous session stuff
    console.log(`[getUserInfoFromRequest] Auth properties: isAuthenticated=${req.isAuthenticated}, isAnonymous=${req.isAnonymous}`);
    console.log(`[getUserInfoFromRequest] Authenticated user object:`, req.user);
    
    return {
      user_id: req.user.id,
      is_anonymous: false,
      anonymous_session_id: null
    };
  }
  
  // If we get here, we're dealing with an anonymous user
  // Get the anonymous session ID from multiple possible sources
  let anonymousSessionId = null;
  
  // First check if it's in req.sessionId (from auth middleware)
  if (req.sessionId) {
    anonymousSessionId = req.sessionId;
    console.log(`[getUserInfoFromRequest] Found session ID in req.sessionId: ${anonymousSessionId}`);
  }
  
  // If not found, check the header
  if (!anonymousSessionId) {
    const headerSessionId = req.headers['x-anonymous-session'];
    if (headerSessionId) {
      anonymousSessionId = Array.isArray(headerSessionId) ? headerSessionId[0] : headerSessionId;
      console.log(`[getUserInfoFromRequest] Found session ID in headers: ${anonymousSessionId}`);
    }
  }
  
  // If a session ID is in the user object, use that (sometimes the middleware sets it there)
  if (!anonymousSessionId && req.user?.anonymous_session_id) {
    anonymousSessionId = req.user.anonymous_session_id;
    console.log(`[getUserInfoFromRequest] Found session ID in user object: ${anonymousSessionId}`);
  }
  
  // Log the auth properties and headers
  console.log(`[getUserInfoFromRequest] Auth properties: isAuthenticated=${req.isAuthenticated}, isAnonymous=${req.isAnonymous}`);
  console.log(`[getUserInfoFromRequest] User object:`, req.user || 'undefined');
  console.log(`[getUserInfoFromRequest] Using anonymous_session_id: ${anonymousSessionId}`);
  
  // Log all relevant headers for debugging
  console.log(`[getUserInfoFromRequest] x-anonymous-session header: ${req.headers['x-anonymous-session'] || 'not set'}`);
  console.log(`[getUserInfoFromRequest] cookie header: ${req.headers.cookie || 'not set'}`);
  
  return {
    user_id: req.user?.id || null,
    is_anonymous: true,
    anonymous_session_id: anonymousSessionId
  };
}

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
    return handleApiError(res, error);
  }
});

/**
 * Process a video from the front end - root /api/videos endpoint
 * This is to handle the client's POST request to /api/videos
 */
router.post('/', requireAnyUser, async (req: Request, res: Response) => {
  try {
    // Get user information from auth middleware via helper function
    const userInfo = getUserInfoFromRequest(req);
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
        const error = new AnonymousLimitError(
          "Anonymous users can only save up to 3 videos. Please sign in to save more.",
          "To save additional videos, you'll need to create an account. This allows you to access all your videos from any device and unlock more features."
        );
        return handleApiError(res, error);
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
      user_id: userInfo.is_anonymous ? 7 : (userInfo.user_id as number), // Use user_id=7 for anonymous users
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
      const validationError = {
        message: error.errors[0].message,
        code: ErrorCode.VALIDATION_ERROR,
        details: error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')
      };
      return sendError(res, validationError.message, 400, validationError.code, validationError.details);
    }
    console.error("Error processing video:", error);
    return handleApiError(res, error);
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
    
    // Get user information from auth middleware via helper function
    const userInfo = getUserInfoFromRequest(req);
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
        return handleApiError(res, error);
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
      const validationError = {
        message: error.errors[0].message,
        code: ErrorCode.VALIDATION_ERROR,
        details: error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')
      };
      return sendError(res, validationError.message, 400, validationError.code, validationError.details);
    }
    console.error("Error fetching videos:", error);
    return handleApiError(res, error);
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
      const validationError = {
        message: error.errors[0].message,
        code: ErrorCode.VALIDATION_ERROR,
        details: error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')
      };
      return sendError(res, validationError.message, 400, validationError.code, validationError.details);
    }
    console.error("Error analyzing video:", error);
    return handleApiError(res, error);
  }
});

/**
 * Process a YouTube video URL and save it
 */
router.post('/process', requireAnyUser, async (req: Request, res: Response) => {
  try {
    // Validate YouTube URL
    const { url } = youtubeUrlSchema.parse(req.body);
    
    // Get user information from auth middleware via helper function
    const userInfo = getUserInfoFromRequest(req);
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
        const error = new AnonymousLimitError(
          "Anonymous users can only save up to 3 videos. Please sign in to save more.",
          "To save additional videos, you'll need to create an account. This allows you to access all your videos from any device and unlock more features."
        );
        return handleApiError(res, error);
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
      user_id: userInfo.is_anonymous ? 7 : (userInfo.user_id as number), // Use user_id=7 for anonymous users
      anonymous_session_id: userInfo.is_anonymous ? userInfo.anonymous_session_id : null
    });
    
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
      const validationError = {
        message: error.errors[0].message,
        code: ErrorCode.VALIDATION_ERROR,
        details: error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')
      };
      return sendError(res, validationError.message, 400, validationError.code, validationError.details);
    }
    console.error("Error processing video from URL:", error);
    return handleApiError(res, error);
  }
});

/**
 * Bulk update videos
 */
router.patch('/', requireAnyUser, async (req: Request, res: Response) => {
  try {
    // Get user information from auth middleware via helper function
    const userInfo = getUserInfoFromRequest(req);
    console.log("[video routes] Bulk updating videos for user:", userInfo.user_id);
    
    // Extract data from request
    const { ids, data } = req.body;
    
    // Validate inputs
    if (!Array.isArray(ids) || ids.length === 0) {
      return sendError(res, "Valid video IDs array is required", 400, "VALIDATION_ERROR");
    }
    
    if (!data || typeof data !== 'object') {
      return sendError(res, "Valid update data is required", 400, "VALIDATION_ERROR");
    }
    
    // Perform bulk update
    const updatedCount = await dbStorage.bulkUpdateVideos(ids, data);
    
    // Return success response
    return sendSuccess(res, { 
      message: `Updated ${updatedCount} videos`,
      updatedCount
    });
  } catch (error) {
    console.error("Error bulk updating videos:", error);
    return handleApiError(res, error);
  }
});

/**
 * Bulk delete videos
 */
router.delete('/bulk', requireAnyUser, async (req: Request, res: Response) => {
  try {
    // Get user information from auth middleware via helper function
    const userInfo = getUserInfoFromRequest(req);
    console.log("[video routes] Bulk deleting videos for user:", userInfo.user_id);
    
    // Extract video IDs from request
    const { ids } = req.body;
    
    // Validate input
    if (!Array.isArray(ids) || ids.length === 0) {
      return sendError(res, "Valid video IDs array is required", 400, "VALIDATION_ERROR");
    }
    
    // Delete any associated embeddings first
    for (const id of ids) {
      await deleteVideoEmbeddings(id);
    }
    
    // Perform bulk delete
    const deletedCount = await dbStorage.bulkDeleteVideos(ids);
    
    // Return success response
    return sendSuccess(res, { 
      message: `Deleted ${deletedCount} videos`,
      deletedCount
    });
  } catch (error) {
    console.error("Error bulk deleting videos:", error);
    return handleApiError(res, error);
  }
});

/**
 * Get a single video by ID
 * This route MUST be placed after all other GET routes with specific paths
 * as Express will match '/:id' for ANY path segment if placed earlier
 */
router.get('/:id', validateNumericParam('id'), requireAnyUser, async (req: Request, res: Response) => {
  try {
    // Get the video ID from the request parameters
    const videoId = parseInt(req.params.id, 10);
    
    // Get user info from auth middleware via helper function
    const userInfo = getUserInfoFromRequest(req);
    console.log(`[video routes] Fetching video ${videoId} for user:`, userInfo);
    console.log(`[video routes] Request headers:`, req.headers);
    console.log(`[video routes] Anonymous session ID:`, userInfo.anonymous_session_id);
    
    // Fetch the video from the database
    const video = await dbStorage.getVideo(videoId);
    
    // Check if the video exists
    if (!video) {
      return sendError(res, "Video not found", 404, "NOT_FOUND");
    }
    
    console.log(`[video routes] Found video:`, {
      id: video.id,
      title: video.title,
      user_id: video.user_id,
      anonymous_session_id: video.anonymous_session_id
    });
    
    // Check if this user has access to this video
    // 1. For authenticated users, they should only see their own videos
    // 2. For anonymous users, they should only see videos from their session
    if (userInfo.is_anonymous) {
      console.log(`[video routes] Checking anonymous access: 
        Video session ID: ${video.anonymous_session_id} 
        Request session ID: ${userInfo.anonymous_session_id}`);
        
      if (video.anonymous_session_id !== userInfo.anonymous_session_id) {
        console.log(`[video routes] Access denied for anonymous user - session mismatch`);
        return sendError(res, "Video not found for this anonymous session", 404, "NOT_FOUND");
      }
      
      console.log(`[video routes] Anonymous user access granted to video ${videoId}`);
    } else {
      // Authenticated user
      console.log(`[video routes] Checking authenticated access: 
        Video user_id: ${video.user_id} 
        Request user_id: ${userInfo.user_id}`);
        
      if (video.user_id !== userInfo.user_id) {
        console.log(`[video routes] Access denied for authenticated user - user ID mismatch`);
        return sendError(res, "You don't have access to this video", 403, "FORBIDDEN");
      }
      
      console.log(`[video routes] Authenticated user access granted to video ${videoId}`);
    }
    
    // Return the video data
    return sendSuccess(res, video);
  } catch (error) {
    console.error("Error fetching video:", error);
    return handleApiError(res, error);
  }
});

/**
 * Update a video
 */
router.patch('/:id', validateNumericParam('id'), requireAnyUser, async (req: Request, res: Response) => {
  try {
    // Get the video ID from the request parameters
    const videoId = parseInt(req.params.id, 10);
    
    // Get user information from auth middleware via helper function
    const userInfo = getUserInfoFromRequest(req);
    console.log(`[video routes] Updating video ${videoId} for user:`, userInfo.user_id);
    
    // Fetch the video to check ownership
    const video = await dbStorage.getVideo(videoId);
    
    // Check if the video exists
    if (!video) {
      return sendError(res, "Video not found", 404, "NOT_FOUND");
    }
    
    // Check if this user has access to update this video
    // 1. For authenticated users, they should only update their own videos
    // 2. For anonymous users, they should only update videos from their session
    if (userInfo.is_anonymous) {
      if (video.anonymous_session_id !== userInfo.anonymous_session_id) {
        return sendError(res, "Video not found for this anonymous session", 404, "NOT_FOUND");
      }
    } else {
      // Authenticated user
      if (video.user_id !== userInfo.user_id) {
        return sendError(res, "You don't have access to update this video", 403, "FORBIDDEN");
      }
    }
    
    // Update the video
    const updatedVideo = await dbStorage.updateVideo(videoId, req.body);
    
    if (!updatedVideo) {
      return sendError(res, "Failed to update video", 500, "UPDATE_FAILED");
    }
    
    // Return the updated video
    return sendSuccess(res, updatedVideo);
  } catch (error) {
    console.error("Error updating video:", error);
    return handleApiError(res, error);
  }
});

/**
 * Delete a video
 */
router.delete('/:id', validateNumericParam('id'), requireAnyUser, async (req: Request, res: Response) => {
  try {
    // Get the video ID from the request parameters
    const videoId = parseInt(req.params.id, 10);
    
    // Get user information from auth middleware via helper function
    const userInfo = getUserInfoFromRequest(req);
    console.log(`[video routes] Deleting video ${videoId} for user:`, userInfo.user_id);
    
    // Fetch the video to check ownership
    const video = await dbStorage.getVideo(videoId);
    
    // Check if the video exists
    if (!video) {
      return sendError(res, "Video not found", 404, "NOT_FOUND");
    }
    
    // Check if this user has access to delete this video
    // 1. For authenticated users, they should only delete their own videos
    // 2. For anonymous users, they should only delete videos from their session
    if (userInfo.is_anonymous) {
      if (video.anonymous_session_id !== userInfo.anonymous_session_id) {
        return sendError(res, "Video not found for this anonymous session", 404, "NOT_FOUND");
      }
    } else {
      // Authenticated user
      if (video.user_id !== userInfo.user_id) {
        return sendError(res, "You don't have access to delete this video", 403, "FORBIDDEN");
      }
    }
    
    // Delete any associated embeddings first
    await deleteVideoEmbeddings(videoId);
    
    // Delete the video
    const success = await dbStorage.deleteVideo(videoId);
    
    if (!success) {
      return sendError(res, "Failed to delete video", 500, "DELETE_FAILED");
    }
    
    // Return success response
    return sendSuccess(res, { 
      message: "Video deleted successfully",
      id: videoId
    });
  } catch (error) {
    console.error("Error deleting video:", error);
    return handleApiError(res, error);
  }
});

export default router;