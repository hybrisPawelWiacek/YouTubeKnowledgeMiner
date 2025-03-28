/**
 * HTTP Request/Response Logging Middleware
 * 
 * This middleware logs all HTTP requests and responses with timing information
 * and other useful metadata for debugging and monitoring.
 */

import { Request, Response, NextFunction } from 'express';
import { createLogger } from '../services/logger';
import { v4 as uuidv4 } from 'uuid';

// Create HTTP-specific logger
const httpLogger = createLogger('http');

/**
 * Express middleware to log HTTP requests and responses
 */
export function httpLoggerMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Skip logging for static assets in development to reduce noise
  if (process.env.NODE_ENV === 'development' && shouldSkipLogging(req.path)) {
    return next();
  }

  // Generate a unique ID for the request for correlation
  const requestId = uuidv4();
  (req as any).requestId = requestId;

  // Record request start time
  const startTime = Date.now();

  // Log the incoming request
  httpLogger.logHttpRequest(req, { requestId });

  // Override the end method to log response
  // Using a monkey-patch approach to maintain type compatibility
  const originalResEnd = res.end;
  
  res.end = function(this: any, ...args: any[]): any {
    // Calculate duration
    const duration = Date.now() - startTime;

    // Log the response
    httpLogger.logHttpResponse(req, res, duration, { requestId });

    // Call the original end method with all arguments
    return originalResEnd.apply(this, args);
  } as typeof res.end;

  next();
}

/**
 * Determine if logging should be skipped for a path
 * Skip static assets to reduce noise in development
 */
function shouldSkipLogging(path: string): boolean {
  const skipPatterns = [
    /\.(ico|png|jpg|jpeg|gif|webp|svg|css|js|woff|woff2|ttf|eot)$/i,
    /^\/__vite_ping$/,
    /^\/node_modules\//,
    /^\/@vite\/client$/,
    /^\/@fs\//
  ];

  return skipPatterns.some(pattern => pattern.test(path));
}