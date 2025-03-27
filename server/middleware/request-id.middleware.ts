/**
 * Request ID Middleware
 * 
 * This middleware generates a unique ID for each request and adds it to the request object.
 * It also adds the request ID to the response headers for client-side correlation.
 */

import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';

// Augment the Express Request interface to include requestId
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
  // Check if the request already has an ID (e.g., from a load balancer or gateway)
  const existingRequestId = req.headers['x-request-id'];
  
  // Use the existing ID or generate a new one
  const requestId = existingRequestId ? 
    existingRequestId.toString() : 
    uuidv4();
  
  // Add the ID to the request object for use in route handlers
  req.requestId = requestId;
  
  // Add the ID to the response headers for client-side correlation
  res.setHeader('X-Request-ID', requestId);
  
  next();
}

export default requestIdMiddleware;