import { Router, Request, Response } from 'express';
import { ZodError } from 'zod';
import { 
  exportRequestSchema, 
  exportFormatEnum 
} from '@shared/schema';
import { 
  exportVideoContent, 
  exportBatchVideoContent, 
  saveExportPreference, 
  getExportPreference 
} from '../services/export';
import { requireAuth } from '../middleware/auth.middleware';
import { sendSuccess, sendError } from '../utils/response.utils';

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

/**
 * Helper function to get user ID from request
 * Returns the user ID or null if anonymous
 */
function getUserIdFromRequest(req: Request): number | null {
  return req.user?.id || null;
}

/**
 * Export video content (transcript, summary, or Q&A)
 * For authenticated users only
 */
router.post('/', requireAuth, async (req: Request, res: Response) => {
  try {
    // Parse request and add userId
    const exportRequest = req.body;

    // Get user ID using our helper function
    const userId = getUserIdFromRequest(req);
    
    console.log("EXPORT: Using user ID from request:", userId);
    exportRequest.userId = userId;

    const exportData = exportRequestSchema.parse(exportRequest);

    let result;
    if (exportData.video_ids.length === 1) {
      // Single video export
      result = await exportVideoContent(exportData);

      return sendSuccess(res, {
        filename: result.filename,
        content: result.content,
        mimeType: result.mimeType
      });
    } else {
      // Batch export
      result = await exportBatchVideoContent(exportData);

      return sendSuccess(res, {
        filename: result.filename,
        content: result.content,
        mimeType: result.mimeType
      });
    }
  } catch (error) {
    if (error instanceof ZodError) {
      return sendError(res, error.errors[0].message, 400);
    }
    console.error("Error exporting content:", error);
    return sendError(res, 
      "Failed to export content", 
      500, 
      error instanceof Error ? error.message : String(error)
    );
  }
});

/**
 * Get user's export format preference
 * Works for both anonymous and authenticated users
 */
router.get('/preferences', async (req: Request, res: Response) => {
  try {
    // Get user ID using our helper function
    const userId = getUserIdFromRequest(req);
    
    console.log("GET EXPORT PREFERENCES: Using user ID from request:", userId);
    
    // For anonymous users, return default format without requiring authentication
    const format = userId !== null 
      ? await getExportPreference(userId)
      : 'txt'; // Default format for anonymous users
      
    return sendSuccess(res, { format });
  } catch (error) {
    console.error("Error getting export preferences:", error);
    return sendError(res, "Failed to get export preferences");
  }
});

/**
 * Save user's export format preference
 * For authenticated users only
 */
router.post('/preferences', requireAuth, async (req: Request, res: Response) => {
  try {
    const { format } = req.body;

    if (!format || !exportFormatEnum.enumValues.includes(format)) {
      return sendError(res, 
        `Format must be one of: ${exportFormatEnum.enumValues.join(", ")}`,
        400
      );
    }

    // Get user ID using our helper function
    const userId = getUserIdFromRequest(req);
    
    console.log("SAVE EXPORT PREFERENCES: Using user ID from request:", userId);
    
    // Save the preference
    await saveExportPreference(userId as number, format);
    
    return sendSuccess(res, { format });
  } catch (error) {
    console.error("Error saving export preferences:", error);
    return sendError(res, "Failed to save export preferences");
  }
});

export default router;