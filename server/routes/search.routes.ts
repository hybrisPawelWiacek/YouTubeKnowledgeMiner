import { Router, Request, Response } from 'express';
import { ZodError } from 'zod';
import { insertSavedSearchSchema } from '@shared/schema';
import { storage } from '../storage';
import { requireAuth } from '../middleware/auth.middleware';
import { validateNumericParam } from '../middleware/validation.middleware';
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
 * Get all saved searches for a user
 * Anonymous users with valid sessions can access this endpoint but will receive an empty array
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    // Get user info from request (now attached by middleware)
    const userId = getUserIdFromRequest(req);
    const isAnonymous = req.isAnonymous;
    
    console.log("SAVED SEARCHES: Using user ID from request:", userId);
    console.log("SAVED SEARCHES: Is anonymous:", isAnonymous, "Has session:", !!req.sessionId);
    
    // Anonymous users don't have saved searches - return empty array for consistent API response
    const savedSearches = !isAnonymous && userId ? await storage.getSavedSearchesByUserId(userId) : [];
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
    const userId = getUserIdFromRequest(req);
    
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
 * Requires authentication (not anonymous)
 */
router.delete('/:id', requireAuth, validateNumericParam('id'), async (req: Request, res: Response) => {
  try {
    const searchId = parseInt(req.params.id);
    
    // Get user ID from request
    const userId = getUserIdFromRequest(req);
    console.log("DELETE SAVED SEARCH: Using user ID from request:", userId);
    
    // Get the saved search to check ownership
    const savedSearch = await storage.getSavedSearch(searchId);
    if (!savedSearch) {
      return sendError(res, "Saved search not found", 404);
    }
    
    // Check if user owns this saved search
    if (userId !== savedSearch.user_id) {
      return sendError(res, "You don't have permission to delete this saved search", 403);
    }

    const deleted = await storage.deleteSavedSearch(searchId);
    if (!deleted) {
      return sendError(res, "Failed to delete saved search", 500);
    }

    return res.status(204).end();
  } catch (error) {
    console.error("Error deleting saved search:", error);
    return sendError(res, "Failed to delete saved search");
  }
});

// Note: Semantic Search functionality has been moved to /server/routes/semantic-search.routes.ts
// to better align with PRD requirements for the Explorer page

export default router;