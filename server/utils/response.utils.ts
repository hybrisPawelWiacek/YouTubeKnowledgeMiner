import { Response } from 'express';

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