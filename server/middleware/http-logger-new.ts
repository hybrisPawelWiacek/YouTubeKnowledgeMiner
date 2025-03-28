/**
 * HTTP Request/Response Logging Middleware
 * 
 * This middleware logs all HTTP requests and responses with timing information
 * and other useful metadata for debugging and monitoring.
 */

import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { createLogger } from '../services/logger';

// Create HTTP-specific logger that logs to http.log
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
  if (shouldSkipPath(req.path)) {
    return next();
  }

  // Generate a unique request ID for correlation
  const requestId = uuidv4();
  (req as any).requestId = requestId;

  // Record request start time
  const startTime = process.hrtime();

  // Log the incoming request
  httpLogger.info(`${req.method} ${req.path}`, {
    requestId,
    method: req.method,
    path: req.path,
    query: req.query,
    ip: req.ip,
    userAgent: req.get('user-agent')
  });

  // Store the original end function
  const originalEnd = res.end;

  // Override the end function to log response details
  res.end = function(this: Response, chunk?: any, encoding?: BufferEncoding, cb?: () => void): Response {
    // Calculate request duration
    const hrDuration = process.hrtime(startTime);
    const durationMs = (hrDuration[0] * 1000) + (hrDuration[1] / 1000000);

    // Log the response
    httpLogger.info(`${res.statusCode} ${req.method} ${req.path} (${durationMs.toFixed(2)}ms)`, {
      requestId,
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration: durationMs
    });

    // Call the original end function with proper arguments
    if (arguments.length === 0) {
      return originalEnd.call(this);
    } else if (arguments.length === 1) {
      return originalEnd.call(this, chunk);
    } else if (arguments.length === 2) {
      return originalEnd.call(this, chunk, encoding);
    } else {
      return originalEnd.call(this, chunk, encoding, cb);
    }
  };

  next();
}

/**
 * Determine if logging should be skipped for a path
 * Skip static assets to reduce noise in development
 */
function shouldSkipPath(path: string): boolean {
  const skipPatterns = [
    /\.(ico|png|jpg|jpeg|gif|webp|svg|css|js|woff|woff2|ttf|eot)$/i,
    /^\/__vite_ping$/,
    /^\/node_modules\//,
    /^\/@vite\/client$/,
    /^\/@fs\//
  ];

  return skipPatterns.some(pattern => pattern.test(path));
}