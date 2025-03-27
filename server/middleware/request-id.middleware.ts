/**
 * Request ID Middleware
 * 
 * This middleware generates a unique ID for each request and adds it to the request object.
 * It also adds the request ID to the response headers for client-side correlation.
 */

import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';

// Augment Express Request interface to include requestId
declare global {
  namespace Express {
    interface Request {
      requestId?: string;
    }
  }
}

/**
 * Middleware to generate a unique ID for each request
 * Adds the ID to the request object and to the response headers
 */
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction) {
  // Generate a unique ID using UUID v4
  const requestId = uuidv4();
  
  // Attach it to the request object
  req.requestId = requestId;
  
  // Add it to the response headers (useful for client-side tracing)
  res.setHeader('X-Request-ID', requestId);
  
  next();
}

// Default export for convenience
export default requestIdMiddleware;