import { Router, Request, Response } from 'express';
import { ZodError } from 'zod';
import { dbStorage } from '../database-storage';
import { requireAuth, requireAnyUser } from '../middleware/auth.middleware';
import { validateNumericParam, validateRequest } from '../middleware/validation.middleware';
import { insertCollectionSchema } from '../../shared/schema';
import { sendSuccess, sendError } from '../utils/response.utils';

// Create router
const router = Router();

/**
 * Helper function to get user information from request object
 * This function adapts the new auth middleware format to the existing code
 */
function getUserInfoFromRequest(req: Request) {
  return {
    user_id: req.user?.id,
    is_anonymous: req.isAnonymous,
    anonymous_session_id: req.isAnonymous && req.sessionId ? req.sessionId : null
  };
}

// In the new auth system, we don't need to apply a separate middleware
// as the user info is attached to the request by the auth middleware

/**
 * Get all collections for the authenticated user
 * Anonymous users with valid sessions can access this endpoint but will receive an empty array
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    // Get user info from the request object where auth middleware sets it
    const userInfo = getUserInfoFromRequest(req);
    const userId = userInfo.user_id;
    
    console.log("COLLECTIONS: Using user ID from request:", userId);
    console.log("COLLECTIONS: Is anonymous:", userInfo.is_anonymous, "Has session:", !!userInfo.anonymous_session_id);
    
    // Anonymous users don't have collections in the current implementation
    // But we still respond with an empty array for valid anonymous users with sessions
    const collections = userId && !userInfo.is_anonymous ? await dbStorage.getCollectionsByUserId(userId) : [];
    return sendSuccess(res, collections);
  } catch (error) {
    console.error("Error fetching collections:", error);
    return sendError(res, "Failed to fetch collections", 500);
  }
});

/**
 * Get a single collection by ID
 */
router.get('/:id', validateNumericParam('id'), async (req: Request, res: Response) => {
  try {
    const collectionId = parseInt(req.params.id);
    
    const collection = await dbStorage.getCollection(collectionId);
    if (!collection) {
      return sendError(res, "Collection not found", 404, "NOT_FOUND");
    }

    return sendSuccess(res, collection);
  } catch (error) {
    console.error("Error fetching collection:", error);
    return sendError(res, "Failed to fetch collection", 500);
  }
});

/**
 * Create a new collection
 * Requires authentication (not anonymous)
 */
router.post('/', requireAuth, validateRequest(insertCollectionSchema), async (req: Request, res: Response) => {
  try {
    const validatedData = req.body;

    // Get user info from request using helper function
    const userInfo = getUserInfoFromRequest(req);
    const userId = userInfo.user_id;
    
    console.log("CREATE COLLECTION: Using user ID from request:", userId);
    
    // Anonymous users can't create collections
    if (userId === null) {
      return sendError(res, "Authentication required to create collections", 401, "AUTH_REQUIRED");
    }
    
    const collection = await dbStorage.createCollection({
      ...validatedData,
      user_id: userId
    });

    return sendSuccess(res, collection, 201);
  } catch (error) {
    if (error instanceof ZodError) {
      return sendError(res, error.errors[0].message, 400, "VALIDATION_ERROR");
    }
    console.error("Error creating collection:", error);
    return sendError(res, "Failed to create collection", 500);
  }
});

/**
 * Update a collection
 * Requires authentication (not anonymous)
 */
router.patch('/:id', requireAuth, validateNumericParam('id'), async (req: Request, res: Response) => {
  try {
    const collectionId = parseInt(req.params.id);
    const { name, description } = req.body;

    // Get the collection to check ownership
    const collection = await dbStorage.getCollection(collectionId);
    if (!collection) {
      return sendError(res, "Collection not found", 404, "NOT_FOUND");
    }

    // Check if user owns this collection
    const userInfo = getUserInfoFromRequest(req);
    if (userInfo.user_id !== collection.user_id) {
      return sendError(res, "You don't have permission to update this collection", 403, "FORBIDDEN");
    }

    // Update the collection
    const updatedCollection = await dbStorage.updateCollection(collectionId, {
      name,
      description
    });

    if (!updatedCollection) {
      return sendError(res, "Failed to update collection", 500);
    }

    return sendSuccess(res, updatedCollection);
  } catch (error) {
    console.error("Error updating collection:", error);
    return sendError(res, "Failed to update collection", 500);
  }
});

/**
 * Delete a collection
 * Requires authentication (not anonymous)
 */
router.delete('/:id', requireAuth, validateNumericParam('id'), async (req: Request, res: Response) => {
  try {
    const collectionId = parseInt(req.params.id);
    
    // Get the collection to check ownership
    const collection = await dbStorage.getCollection(collectionId);
    if (!collection) {
      return sendError(res, "Collection not found", 404, "NOT_FOUND");
    }

    // Check if user owns this collection
    const userInfo = getUserInfoFromRequest(req);
    if (userInfo.user_id !== collection.user_id) {
      return sendError(res, "You don't have permission to delete this collection", 403, "FORBIDDEN");
    }

    // Delete the collection
    const deleted = await dbStorage.deleteCollection(collectionId);
    if (!deleted) {
      return sendError(res, "Failed to delete collection", 500);
    }

    return res.status(204).end();
  } catch (error) {
    console.error("Error deleting collection:", error);
    return sendError(res, "Failed to delete collection", 500);
  }
});

/**
 * Get videos in a collection
 */
router.get('/:id/videos', validateNumericParam('id'), async (req: Request, res: Response) => {
  try {
    const collectionId = parseInt(req.params.id);
    
    // Get the collection to check if it exists
    const collection = await dbStorage.getCollection(collectionId);
    if (!collection) {
      return sendError(res, "Collection not found", 404, "NOT_FOUND");
    }

    // Get videos in the collection
    const videos = await dbStorage.getCollectionVideos(collectionId);
    return sendSuccess(res, videos);
  } catch (error) {
    console.error("Error fetching collection videos:", error);
    return sendError(res, "Failed to fetch collection videos", 500);
  }
});

/**
 * Add a video to a collection
 * Requires authentication (not anonymous)
 */
router.post('/:id/videos', requireAuth, validateNumericParam('id'), async (req: Request, res: Response) => {
  try {
    const collectionId = parseInt(req.params.id);
    const { video_id } = req.body;
    
    if (!video_id || typeof video_id !== 'number') {
      return sendError(res, "Video ID is required", 400, "VALIDATION_ERROR");
    }

    // Get the collection to check ownership
    const collection = await dbStorage.getCollection(collectionId);
    if (!collection) {
      return sendError(res, "Collection not found", 404, "NOT_FOUND");
    }

    // Check if user owns this collection
    const userInfo = getUserInfoFromRequest(req);
    if (userInfo.user_id !== collection.user_id) {
      return sendError(res, "You don't have permission to modify this collection", 403, "FORBIDDEN");
    }

    // Add video to collection
    await dbStorage.addVideoToCollection({
      collection_id: collectionId,
      video_id
    });

    return sendSuccess(res, { message: "Video added to collection" }, 201);
  } catch (error) {
    console.error("Error adding video to collection:", error);
    return sendError(res, "Failed to add video to collection", 500);
  }
});

/**
 * Remove a video from a collection
 * Requires authentication (not anonymous)
 */
router.delete('/:id/videos/:videoId', requireAuth, validateNumericParam('id'), validateNumericParam('videoId'), async (req: Request, res: Response) => {
  try {
    const collectionId = parseInt(req.params.id);
    const videoId = parseInt(req.params.videoId);

    // Get the collection to check ownership
    const collection = await dbStorage.getCollection(collectionId);
    if (!collection) {
      return sendError(res, "Collection not found", 404, "NOT_FOUND");
    }

    // Check if user owns this collection
    const userInfo = res.locals.userInfo;
    if (userInfo.user_id !== collection.user_id) {
      return sendError(res, "You don't have permission to modify this collection", 403, "FORBIDDEN");
    }

    // Remove video from collection
    await dbStorage.removeVideoFromCollection(collectionId, videoId);
    return res.status(204).end();
  } catch (error) {
    console.error("Error removing video from collection:", error);
    return sendError(res, "Failed to remove video from collection", 500);
  }
});

/**
 * Add multiple videos to a collection (bulk operation)
 * Requires authentication (not anonymous)
 */
router.post('/:id/videos/bulk', requireAuth, validateNumericParam('id'), async (req: Request, res: Response) => {
  try {
    const collectionId = parseInt(req.params.id);
    const { video_ids } = req.body;
    
    if (!Array.isArray(video_ids) || video_ids.length === 0) {
      return sendError(res, "Video IDs array is required", 400, "VALIDATION_ERROR");
    }

    // Get the collection to check ownership
    const collection = await dbStorage.getCollection(collectionId);
    if (!collection) {
      return sendError(res, "Collection not found", 404, "NOT_FOUND");
    }

    // Check if user owns this collection
    const userInfo = res.locals.userInfo;
    if (userInfo.user_id !== collection.user_id) {
      return sendError(res, "You don't have permission to modify this collection", 403, "FORBIDDEN");
    }

    // Add videos to collection
    await dbStorage.bulkAddVideosToCollection(collectionId, video_ids);

    return sendSuccess(res, { 
      message: `${video_ids.length} videos added to collection`,
      count: video_ids.length
    }, 201);
  } catch (error) {
    console.error("Error adding videos to collection:", error);
    return sendError(res, "Failed to add videos to collection", 500);
  }
});

export default router;