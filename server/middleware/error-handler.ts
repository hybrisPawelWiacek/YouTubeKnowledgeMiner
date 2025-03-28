/**
 * Error Handler Middleware
 * 
 * This middleware catches and logs all errors that occur during request processing,
 * provides structured error responses, and ensures consistent error handling across the application.
 */

import { Request, Response, NextFunction } from 'express';
import { createLogger } from '../services/logger';

const errorLogger = createLogger('error');

/**
 * Error handling middleware
 * Catches all errors and logs them with appropriate details
 */
export function errorHandlerMiddleware(err: any, req: Request, res: Response, next: NextFunction) {
  // Get request ID if it exists (from http-logger middleware)
  const requestId = (req as any).id || 'unknown';
  
  // Determine status code - use the error's code if it exists, otherwise 500
  const statusCode = err.status || err.statusCode || 500;
  
  // Add request details to error log
  const errorDetails = {
    requestId,
    method: req.method,
    path: req.path,
    query: req.query,
    statusCode,
    ip: req.ip,
    userAgent: req.headers['user-agent']
  };
  
  // Log the error with full stack trace and request details
  if (statusCode >= 500) {
    errorLogger.error(`Server Error: ${err.message}`, {
      ...errorDetails,
      stack: err.stack
    });
  } else {
    // For 4xx errors, log as warnings
    errorLogger.warn(`Client Error: ${err.message}`, errorDetails);
  }
  
  // Send a response to the client
  res.status(statusCode).json({
    error: {
      message: process.env.NODE_ENV === 'production' && statusCode === 500
        ? 'Internal server error'  // Generic message in production for 500 errors
        : err.message,
      code: err.code,
      requestId  // Include requestId so client can reference it in support requests
    }
  });
}

export default errorHandlerMiddleware;