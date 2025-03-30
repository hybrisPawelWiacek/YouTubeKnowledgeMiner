import { Router, Request, Response } from 'express';
import { ZodError } from 'zod';
import { semanticSearchSchema } from '@shared/schema';
import { performSemanticSearch, saveSearchHistory } from '../services/embeddings';
import { initializeVectorFunctions } from '../services/supabase';
import { getUserInfo, requireAnyUser } from '../middleware/auth.middleware';
import { sendSuccess, sendError } from '../utils/response.utils';
import { log } from '../vite';

const router = Router();

// Apply user info middleware to all routes
router.use(getUserInfo);

/**
 * Semantic Search API endpoint for the Explorer page
 * Implements RAG-based search across video content with proper context retrieval
 * Supports both authenticated users and anonymous users with sessions
 */
router.post('/', requireAnyUser, async (req: Request, res: Response) => {
  try {
    // Validate request data using schema definition
    const { query, filter, limit } = semanticSearchSchema.parse(req.body);

    log(`Processing semantic search with query: "${query}"`, 'routes');
    log(`Search filters: ${JSON.stringify(filter)}`, 'routes');

    // Initialize Supabase vector functions if not already done
    await initializeVectorFunctions();

    // Get user info from middleware
    const userInfo = res.locals.userInfo;
    const userId = userInfo.user_id;
    
    log(`SEMANTIC SEARCH: Using user ID from request: ${userId}`, 'routes');
    log(`SEMANTIC SEARCH: Is anonymous: ${userInfo.is_anonymous}, Has session: ${!!userInfo.anonymous_session_id}`, 'routes');

    // Build search filters object for the embeddings service
    const searchFilters: any = {
      contentTypes: filter?.content_types,
      videoId: filter?.video_id,
      categoryId: filter?.category_id,
      collectionId: filter?.collection_id,
      isFavorite: filter?.is_favorite,
    };
    
    // For anonymous users, add the session ID to filter by their videos
    if (userInfo.is_anonymous && userInfo.anonymous_session_id) {
      log(`Adding anonymous session ID ${userInfo.anonymous_session_id} to search filters`, 'routes');
      searchFilters.anonymous_session_id = userInfo.anonymous_session_id;
    }
    
    // Execute semantic search using the embeddings service
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
        log(`Error saving search history: ${error}`, 'routes');
      }
    }

    log(`Semantic search returned ${results.length} results`, 'routes');
    return sendSuccess(res, results);
  } catch (error) {
    if (error instanceof ZodError) {
      return sendError(res, error.errors[0].message, 400);
    }
    log(`Error performing semantic search: ${error}`, 'routes');
    return sendError(res, "Failed to perform semantic search");
  }
});

export default router;