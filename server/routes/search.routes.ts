import { Router, Request, Response } from 'express';
import { ZodError } from 'zod';
import { insertSavedSearchSchema, semanticSearchSchema } from '@shared/schema';
import { storage } from '../storage';
import { 
  performSemanticSearch, 
  saveSearchHistory 
} from '../services/embeddings';
import { initializeVectorFunctions } from '../services/supabase';
import { getUserIdFromRequest } from '../middleware/auth.middleware';
import { requireAuth } from '../middleware/auth.middleware';
import { validateNumericParam } from '../middleware/validation.middleware';
import { sendSuccess, sendError } from '../utils/response.utils';
import { log } from '../vite';

const router = Router();

/**
 * Get all saved searches for a user
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    // Get user ID using our helper function
    const userId = await getUserIdFromRequest(req);
    
    console.log("SAVED SEARCHES: Using user ID from request:", userId);
    
    // Anonymous users don't have saved searches
    const savedSearches = userId ? await storage.getSavedSearchesByUserId(userId) : [];
    return sendSuccess(res, savedSearches);
  } catch (error) {
    console.error("Error fetching saved searches:", error);
    return sendError(res, "Failed to fetch saved searches");
  }
});

/**
 * Create a new saved search
 * Requires authentication (not anonymous)
 */
router.post('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const validatedData = insertSavedSearchSchema.parse(req.body);

    // Get user ID using our helper function
    const userId = await getUserIdFromRequest(req);
    
    console.log("CREATE SAVED SEARCH: Using user ID from request:", userId);
    
    const savedSearch = await storage.createSavedSearch({
      ...validatedData,
      user_id: userId as number // userId is guaranteed to be non-null by requireAuth
    });

    return sendSuccess(res, savedSearch, 201);
  } catch (error) {
    if (error instanceof ZodError) {
      return sendError(res, error.errors[0].message, 400);
    }
    console.error("Error creating saved search:", error);
    return sendError(res, "Failed to create saved search");
  }
});

/**
 * Delete a saved search
 * Requires numeric param validation
 */
router.delete('/:id', validateNumericParam('id'), async (req: Request, res: Response) => {
  try {
    const searchId = parseInt(req.params.id);

    const deleted = await storage.deleteSavedSearch(searchId);
    if (!deleted) {
      return sendError(res, "Saved search not found", 404);
    }

    return res.status(204).end();
  } catch (error) {
    console.error("Error deleting saved search:", error);
    return sendError(res, "Failed to delete saved search");
  }
});

/**
 * Semantic Search API endpoint
 */
router.post('/semantic', async (req: Request, res: Response) => {
  try {
    const { query, filter, limit } = semanticSearchSchema.parse(req.body);

    // Initialize Supabase vector functions if not already done
    await initializeVectorFunctions();

    // Get user ID using our helper function
    const userId = await getUserIdFromRequest(req);
    
    console.log("SEMANTIC SEARCH: Using user ID from request:", userId);

    // Execute semantic search
    const results = await performSemanticSearch(
      userId,
      query,
      {
        contentTypes: filter?.content_types,
        videoId: filter?.video_id,
        categoryId: filter?.category_id,
        collectionId: filter?.collection_id,
        isFavorite: filter?.is_favorite
      },
      limit
    );

    // Save search to history only for authenticated users
    if (userId !== null) {
      try {
        await saveSearchHistory(userId, query, filter, results.length);
      } catch (error) {
        // Non-critical, log but continue
        log(`Error saving search history: ${error}`, 'routes');
      }
    }

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