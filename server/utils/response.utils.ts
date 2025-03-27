import { Response } from 'express';
import { ApiError, normalizeError } from './error.utils';

/**
 * Standard success response
 * 
 * @param res Express response object
 * @param data Data to send in the response
 * @param status HTTP status code (default: 200)
 */
export function sendSuccess(res: Response, data: any, status: number = 200) {
  return res.status(status).json(data);
}

/**
 * Handle API success response
 * 
 * @param res Express response object
 * @param data Data to send in the response
 * @param status HTTP status code (default: 200) 
 */
export function handleApiSuccess(res: Response, data: any, status: number = 200) {
  return res.status(status).json({
    success: true,
    data
  });
}

/**
 * Standard error response
 * 
 * @param res Express response object
 * @param message Error message
 * @param status HTTP status code (default: 500)
 * @param code Optional error code for client handling
 * @param details Optional error details for debugging
 */
export function sendError(
  res: Response, 
  message: string, 
  status: number = 500, 
  code?: string,
  details?: string
) {
  const response: { message: string; code?: string; details?: string } = { message };
  
  if (code) {
    response.code = code;
  }
  
  if (details) {
    response.details = details;
  }
  
  return res.status(status).json(response);
}

/**
 * Handle any error and send an appropriate response
 * 
 * @param res Express response object
 * @param error Any error object
 */
export function handleApiError(res: Response, error: any) {
  console.error('API Error:', error);
  
  // Normalize the error to ensure consistent format
  const apiError = normalizeError(error);
  
  // Return the error response
  return res.status(apiError.status).json({
    message: apiError.message,
    code: apiError.code,
    ...(apiError.details ? { details: apiError.details } : {})
  });
}

/**
 * Format a paginated response
 * 
 * @param items Array of items
 * @param totalCount Total count of items (before pagination)
 * @param hasMore Whether there are more items
 * @param nextCursor Optional cursor for the next page
 */
export function formatPaginatedResponse<T>(
  items: T[], 
  totalCount: number, 
  hasMore: boolean, 
  nextCursor?: number
) {
  return {
    items,
    totalCount,
    hasMore,
    ...(nextCursor !== undefined ? { nextCursor } : {})
  };
}