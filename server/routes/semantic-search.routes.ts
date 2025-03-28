import { Router, Request, Response } from 'express';
import { ZodError } from 'zod';
import { semanticSearchSchema } from '@shared/schema';
import { performSemanticSearch, saveSearchHistory } from '../services/embeddings';
import { initializeVectorFunctions } from '../services/vector-search';
import { getUserInfo, requireSession } from '../middleware/auth.middleware';
import { sendSuccess, sendError } from '../utils/response.utils';
import { logger, logSecurityEvent } from '../utils/logger';

const router = Router();

// Apply user info middleware to all routes
router.use(getUserInfo);

/**
 * Semantic Search API endpoint for the Explorer page
 * Implements RAG-based search across video content with proper context retrieval
 * Supports both authenticated users and anonymous users with sessions
 */
router.post('/', requireSession, async (req: Request, res: Response) => {
  try {
    // Validate request data using schema definition
    const { query, filter, limit } = semanticSearchSchema.parse(req.body);
    const requestId = req.headers['x-request-id'] as string || 'unknown';

    logger.info(`Processing semantic search`, {
      requestId,
      searchQuery: query,
      filters: filter
    });

    // Initialize Supabase vector functions if not already done
    await initializeVectorFunctions();

    // Get user info from middleware
    const userInfo = res.locals.userInfo;
    const userId = userInfo.user_id;
    
    logger.info(`Semantic search user context`, {
      requestId,
      userId,
      isAnonymous: userInfo.is_anonymous,
      hasAnonymousSession: !!userInfo.anonymous_session_id
    });

    // SECURITY ENHANCEMENT: Build search filters to ensure data isolation
    // This guarantees that authenticated users only see their own content, 
    // and anonymous users only see content from their own session
    const searchFilters: any = {
      contentTypes: filter?.content_types,
      videoId: filter?.video_id,
      categoryId: filter?.category_id,
      collectionId: filter?.collection_id,
      isFavorite: filter?.is_favorite,
    };
    
    // Always set proper ownership filters based on authentication status
    if (userInfo.is_anonymous && userInfo.anonymous_session_id) {
      // Anonymous user - filter by their session ID
      logger.info(`Applying anonymous session filter for semantic search`, {
        requestId,
        anonymousSessionId: userInfo.anonymous_session_id
      });
      searchFilters.anonymous_session_id = userInfo.anonymous_session_id;
      
      // Explicitly set user_id to null to ensure we're not mixing authentication types
      searchFilters.user_id = null;
    } else if (!userInfo.is_anonymous && userId) {
      // Authenticated user - filter by their user ID
      logger.info(`Applying user filter for semantic search`, {
        requestId,
        userId
      });
      searchFilters.user_id = userId;
      
      // Explicitly set anonymous_session_id to null to ensure we're not mixing authentication types
      searchFilters.anonymous_session_id = null;
    } else {
      // Error case - no valid identification
      logSecurityEvent(
        requestId,
        'unauthorized_semantic_search',
        {
          message: 'Cannot identify user for semantic search - no valid session or user ID',
          endpoint: 'POST /api/semantic-search'
        }
      );
      return sendError(res, "User identification required for semantic search", 401);
    }
    
    // Execute semantic search using the embeddings service with enhanced security filters
    const results = await performSemanticSearch(
      userId,
      query,
      searchFilters,
      limit || 20 // Default to 20 results if not specified
    );

    // Save search to history only for authenticated users (not anonymous)
    if (!userInfo.is_anonymous && userId) {
      try {
        await saveSearchHistory(userId, query, filter, results.length);
      } catch (error) {
        // Non-critical, log but continue
        logger.warn(`Error saving search history`, {
          requestId,
          userId,
          error
        });
      }
    }

    logger.info(`Semantic search completed`, {
      requestId,
      resultsCount: results.length
    });
    
    return sendSuccess(res, results);
  } catch (error) {
    const requestId = req.headers['x-request-id'] as string || 'unknown';
    
    if (error instanceof ZodError) {
      logger.warn(`Semantic search validation error`, {
        requestId,
        error: error.errors
      });
      return sendError(res, error.errors[0].message, 400);
    }
    
    logger.error(`Error performing semantic search`, {
      requestId,
      error
    });
    
    return sendError(res, "Failed to perform semantic search");
  }
});

export default router;