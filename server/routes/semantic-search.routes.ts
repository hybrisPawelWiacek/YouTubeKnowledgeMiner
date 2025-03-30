import { Router, Request, Response } from 'express';
import { ZodError } from 'zod';
import { semanticSearchSchema } from '@shared/schema';
import { performSemanticSearch, saveSearchHistory } from '../services/embeddings';
import { initializeVectorFunctions } from '../services/supabase';
import { requireAnyUser } from '../middleware/auth.middleware';
import { sendSuccess, sendError } from '../utils/response.utils';
import { log } from '../vite';

const router = Router();

/**
 * Helper function to get user ID from request
 * Returns the user ID or null if anonymous
 */
function getUserIdFromRequest(req: Request): number | null {
  return req.user?.id || null;
}

/**
 * Semantic search endpoint that works for both authenticated and anonymous users
 * This supports searching across videos, transcripts, and other content types
 */
router.post('/', requireAnyUser, async (req: Request, res: Response) => {
  try {
    console.log("Semantic search request received:", req.body);
    
    // Validate request body
    const validatedData = semanticSearchSchema.parse(req.body);
    
    // Get user ID from request
    const userId = getUserIdFromRequest(req);
    
    console.log("SEMANTIC SEARCH: Using user ID:", userId, "Is anonymous:", req.isAnonymous);
    
    // Initialize vector functions if needed
    await initializeVectorFunctions();
    
    // Perform the semantic search
    const results = await performSemanticSearch(
      userId,
      validatedData.query,
      {
        videoId: validatedData.filter?.video_id,
        contentTypes: validatedData.filter?.content_types,
        categoryId: validatedData.filter?.category_id,
        collectionId: validatedData.filter?.collection_id,
        isFavorite: validatedData.filter?.is_favorite,
        anonymous_session_id: req.isAnonymous ? req.sessionId : undefined
      },
      validatedData.limit || 10
    );
    
    // Save search history (non-blocking, won't affect response)
    try {
      // Extract filter data from validatedData for search history
      const filterData = {
        content_types: validatedData.filter?.content_types,
        video_id: validatedData.filter?.video_id,
        category_id: validatedData.filter?.category_id,
        collection_id: validatedData.filter?.collection_id,
        is_favorite: validatedData.filter?.is_favorite
      };
      
      saveSearchHistory(
        userId,
        validatedData.query,
        results?.length || 0,
        filterData
      ).catch(err => {
        console.error("Failed to save search history:", err);
      });
    } catch (historyError) {
      console.error("Error saving search history:", historyError);
    }
    
    return sendSuccess(res, {
      results: results || [],
      count: results?.length || 0,
      meta: {
        query: validatedData.query,
        filters: {
          content_types: validatedData.filter?.content_types,
          video_id: validatedData.filter?.video_id,
          category_id: validatedData.filter?.category_id
        }
      }
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return sendError(res, error.errors[0].message, 400);
    }
    
    console.error("Error performing semantic search:", error);
    return sendError(res, "Failed to perform semantic search");
  }
});

export default router;