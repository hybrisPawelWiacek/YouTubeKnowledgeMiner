/**
 * Logging Middleware
 * 
 * This middleware provides automatic logging of HTTP requests and responses
 * with timing information and structured data for better analysis.
 */

import { Request, Response, NextFunction } from 'express';
import { logger, logApiRequest, logApiResponse } from '../utils/logger';

/**
 * Middleware to log incoming HTTP requests
 */
export function requestLogger(req: Request, res: Response, next: NextFunction) {
  try {
    // Don't log requests for static assets
    if (req.path.startsWith('/assets/') || 
        req.path.startsWith('/public/') || 
        req.path.endsWith('.js') || 
        req.path.endsWith('.css') || 
        req.path.endsWith('.ico')) {
      return next();
    }
    
    // Only log API requests in detail
    if (req.path.startsWith('/api/')) {
      logApiRequest(
        req.requestId || 'unknown',
        req.method,
        req.originalUrl,
        req.headers,
        req.query,
        req.params,
        req.method !== 'GET' ? req.body : undefined // Only include body for non-GET requests
      );
    } else {
      // Log other requests more concisely
      logger.debug(`HTTP ${req.method} ${req.originalUrl}`, {
        requestId: req.requestId,
        method: req.method,
        path: req.originalUrl,
        userAgent: req.headers['user-agent']
      });
    }
  } catch (error) {
    // Don't fail the request if logging fails
    logger.error('Error in request logger middleware', {
      error,
      requestId: req.requestId
    });
  }
  
  next();
}

/**
 * Middleware to log HTTP responses with timing information
 */
export function responseLogger(req: Request, res: Response, next: NextFunction) {
  // Record the start time
  const startTime = Date.now();
  
  // Store original end method to intercept it
  const originalEnd = res.end;
  
  // Override end method to capture response data
  res.end = function(chunk?: any, encoding?: any, callback?: any) {
    // Calculate response time
    const responseTime = Date.now() - startTime;
    
    // Only log API responses in detail
    if (req.path.startsWith('/api/')) {
      try {
        // Handle different response body formats
        let responseBody;
        if (res.locals.responseBody) {
          // If we've captured the response body in res.locals (e.g., from a controller)
          responseBody = res.locals.responseBody;
        } else {
          // Try to parse the chunk if it's a string
          if (chunk && typeof chunk === 'string') {
            try {
              responseBody = JSON.parse(chunk);
            } catch (e) {
              // Not JSON, use as-is
              responseBody = chunk;
            }
          } else {
            responseBody = chunk;
          }
        }
        
        // Log the response with timing information
        logApiResponse(
          req.requestId || 'unknown',
          res.statusCode,
          `${responseTime}ms`,
          responseBody
        );
      } catch (error) {
        logger.error('Error logging API response', {
          error,
          requestId: req.requestId
        });
      }
    } else {
      // Log other responses more concisely
      logger.debug(`Response: ${res.statusCode}`, {
        requestId: req.requestId,
        method: req.method,
        url: req.originalUrl,
        statusCode: res.statusCode,
        responseTime: `${responseTime}ms`
      });
    }
    
    // Call the original end method to send the response
    return originalEnd.call(this, chunk, encoding, callback);
  };
  
  next();
}

/**
 * Middleware to log errors in the request pipeline
 */
export function errorLogger(err: any, req: Request, res: Response, next: NextFunction) {
  logger.error(`Error processing ${req.method} ${req.originalUrl}`, {
    requestId: req.requestId,
    error: {
      name: err.name,
      message: err.message,
      stack: err.stack
    },
    method: req.method,
    url: req.originalUrl,
    userAgent: req.headers['user-agent']
  });
  
  next(err);
}

export default {
  requestLogger,
  responseLogger,
  errorLogger
};