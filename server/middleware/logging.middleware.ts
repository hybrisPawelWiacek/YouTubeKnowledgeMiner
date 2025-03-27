/**
 * Logging Middleware
 * 
 * This middleware logs incoming requests and outgoing responses
 * with relevant information for debugging and monitoring.
 */

import { Request, Response, NextFunction } from 'express';
import { logger, logApiRequest, logApiResponse } from '../utils/logger';

/**
 * Middleware to log incoming HTTP requests
 */
export function requestLogger(req: Request, _res: Response, next: NextFunction) {
  const requestId = req.requestId || 'unknown';
  
  // Log API requests comprehensively, client requests minimally
  if (req.url.startsWith('/api/')) {
    logApiRequest(
      requestId,
      req.method,
      req.url,
      req.headers,
      req.query,
      req.params,
      req.method !== 'GET' ? req.body : undefined
    );
  } else {
    // For non-API routes, just log basic request info in debug level
    logger.debug(`Request: ${req.method} ${req.url}`, { 
      method: req.method, 
      url: req.url, 
      requestId 
    });
  }
  
  next();
}

/**
 * Middleware to log outgoing HTTP responses with timing information
 */
export function responseLogger(req: Request, res: Response, next: NextFunction) {
  // Capture the start time
  const startTime = Date.now();
  const requestId = req.requestId || 'unknown';
  
  // Store the original res.end function
  const originalEnd = res.end;
  
  // Override the end function to log response details
  // @ts-ignore - TypeScript's type system doesn't fully capture the complexity of Node's response.end() signatures
  res.end = function(chunk: any, encoding?: any, callback?: any): any {
    // Calculate the response time
    const responseTime = `${Date.now() - startTime}ms`;
    
    // Log API responses comprehensively, client responses minimally
    if (req.url.startsWith('/api/')) {
      logApiResponse(requestId, res.statusCode, responseTime);
    } else {
      // For non-API routes, just log basic response info in debug level
      logger.debug(`Response: ${res.statusCode}`, { 
        method: req.method, 
        url: req.url, 
        statusCode: res.statusCode, 
        responseTime,
        requestId
      });
    }
    
    // Handle the different method signatures of res.end()
    if (typeof encoding === 'function') {
      return originalEnd.call(this, chunk, encoding);
    } else if (typeof callback === 'function') {
      return originalEnd.call(this, chunk, encoding, callback);
    } else {
      return originalEnd.call(this, chunk, encoding);
    }
  };
  
  next();
}

/**
 * Error logging middleware
 * 
 * This should be registered after all route handlers to catch and log errors
 */
export function errorLogger(err: any, req: Request, res: Response, next: NextFunction) {
  const requestId = req.requestId || 'unknown';
  
  logger.error(`Request error: ${err.message}`, {
    error: {
      name: err.name,
      message: err.message,
      stack: err.stack,
      code: err.code,
      status: err.status || 500
    },
    requestId,
    method: req.method,
    url: req.url
  });
  
  next(err);
}

export default {
  requestLogger,
  responseLogger,
  errorLogger
};