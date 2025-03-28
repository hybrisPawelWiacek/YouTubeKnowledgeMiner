/**
 * Performance Monitoring Middleware
 * 
 * This middleware tracks and logs performance metrics for all API requests,
 * helping identify slow endpoints and performance bottlenecks.
 */

import { Request, Response, NextFunction } from 'express';
import { createLogger } from '../services/logger';

const performanceLogger = createLogger('performance');

// Threshold in milliseconds for when to log detailed performance metrics
const SLOW_REQUEST_THRESHOLD = 1000; // 1 second

/**
 * Performance monitoring middleware
 * Measures response time and logs slow requests
 */
export function performanceMonitorMiddleware(req: Request, res: Response, next: NextFunction) {
  // Track request start time
  const startTime = process.hrtime();
  
  // Add a listener for the 'finish' event to measure the total time
  res.on('finish', () => {
    // Calculate duration
    const hrTime = process.hrtime(startTime);
    const durationMs = hrTime[0] * 1000 + hrTime[1] / 1000000;
    
    // Get request ID from http-logger if available
    const requestId = (req as any).id || 'unknown';
    
    // Log basic performance metrics for all requests
    performanceLogger.debug(`${req.method} ${req.path} completed in ${durationMs.toFixed(2)}ms`, {
      requestId,
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration: durationMs
    });
    
    // Log detailed metrics for slow requests
    if (durationMs > SLOW_REQUEST_THRESHOLD) {
      performanceLogger.warn(`Slow request: ${req.method} ${req.path} took ${durationMs.toFixed(2)}ms`, {
        requestId,
        method: req.method,
        path: req.path,
        query: req.query,
        statusCode: res.statusCode,
        duration: durationMs,
        threshold: SLOW_REQUEST_THRESHOLD
      });
    }
  });
  
  next();
}

export default performanceMonitorMiddleware;