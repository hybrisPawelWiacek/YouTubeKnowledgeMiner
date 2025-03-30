import { Router, Request, Response } from 'express';
import { ZodError } from 'zod';
import { dbStorage } from '../database-storage';
import { requireAuth, requireAnyUser } from '../middleware/auth.middleware';
import { validateNumericParam } from '../middleware/validation.middleware';
import { insertCategorySchema } from '../../shared/schema';
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
 * Get all categories (both global and user-specific)
 * Supports anonymous users with sessions
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    // Get user ID using our helper function
    const userInfo = getUserInfoFromRequest(req);
    const userId = userInfo.user_id;
    
    console.log("CATEGORIES: Using user ID from request:", userId);
    console.log("CATEGORIES: Is anonymous:", userInfo.is_anonymous, "Has session:", !!userInfo.anonymous_session_id);

    // Get categories (global for all users, plus user-specific for authenticated users)
    const categories = await dbStorage.getCategories(userId);
    return sendSuccess(res, categories);
  } catch (error) {
    console.error("Error fetching categories:", error);
    return sendError(res, "Failed to fetch categories", 500);
  }
});

/**
 * Get a single category by ID
 */
router.get('/:id', validateNumericParam('id'), async (req: Request, res: Response) => {
  try {
    const categoryId = parseInt(req.params.id);
    
    const category = await dbStorage.getCategory(categoryId);
    if (!category) {
      return sendError(res, "Category not found", 404, "NOT_FOUND");
    }

    return sendSuccess(res, category);
  } catch (error) {
    console.error("Error fetching category:", error);
    return sendError(res, "Failed to fetch category", 500);
  }
});

/**
 * Create a new category
 * Requires authentication (not anonymous)
 */
router.post('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const { name } = req.body;
    if (!name || typeof name !== 'string') {
      return sendError(res, "Category name is required", 400, "VALIDATION_ERROR");
    }

    // Get user ID from middleware
    const userInfo = getUserInfoFromRequest(req);
    const userId = userInfo.user_id;
    
    console.log("CREATE CATEGORY: Using user ID from request:", userId);

    if (userId === null) {
      return sendError(res, "Authentication required", 401, "AUTH_REQUIRED");
    }

    const category = await dbStorage.createCategory({
      name,
      user_id: userId
    });

    return sendSuccess(res, category, 201);
  } catch (error) {
    console.error("Error creating category:", error);
    return sendError(res, "Failed to create category", 500);
  }
});

/**
 * Update a category
 * Requires authentication (not anonymous)
 */
router.patch('/:id', requireAuth, validateNumericParam('id'), async (req: Request, res: Response) => {
  try {
    const categoryId = parseInt(req.params.id);
    const { name } = req.body;
    
    if (!name || typeof name !== 'string') {
      return sendError(res, "Category name is required", 400, "VALIDATION_ERROR");
    }

    // Get the category to check ownership
    const category = await dbStorage.getCategory(categoryId);
    if (!category) {
      return sendError(res, "Category not found", 404, "NOT_FOUND");
    }

    // Check if user owns this category or if it's a global category
    const userInfo = getUserInfoFromRequest(req);
    if (category.is_global || (userInfo.user_id !== category.user_id)) {
      return sendError(res, "You don't have permission to update this category", 403, "FORBIDDEN");
    }

    // Update the category
    const updatedCategory = await dbStorage.updateCategory(categoryId, { name });
    if (!updatedCategory) {
      return sendError(res, "Failed to update category", 500);
    }

    return sendSuccess(res, updatedCategory);
  } catch (error) {
    console.error("Error updating category:", error);
    return sendError(res, "Failed to update category", 500);
  }
});

/**
 * Delete a category
 * Requires authentication (not anonymous)
 */
router.delete('/:id', requireAuth, validateNumericParam('id'), async (req: Request, res: Response) => {
  try {
    const categoryId = parseInt(req.params.id);
    
    // Get the category to check ownership
    const category = await dbStorage.getCategory(categoryId);
    if (!category) {
      return sendError(res, "Category not found", 404, "NOT_FOUND");
    }

    // Check if user owns this category or if it's a global category
    const userInfo = getUserInfoFromRequest(req);
    if (category.is_global || (userInfo.user_id !== category.user_id)) {
      return sendError(res, "You don't have permission to delete this category", 403, "FORBIDDEN");
    }

    // Delete the category
    const deleted = await dbStorage.deleteCategory(categoryId);
    if (!deleted) {
      return sendError(res, "Failed to delete category", 500);
    }

    return res.status(204).end();
  } catch (error) {
    console.error("Error deleting category:", error);
    return sendError(res, "Failed to delete category", 500);
  }
});

export default router;