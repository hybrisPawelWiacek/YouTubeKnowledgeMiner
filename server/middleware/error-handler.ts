/**
 * Error Handling Middleware
 * 
 * This middleware catches and logs errors that occur during request processing.
 * It provides standardized error responses and detailed error logging.
 */

import { Request, Response, NextFunction } from 'express';
import { createLogger } from '../services/logger';

// Create error-specific logger
const errorLogger = createLogger('error');

/**
 * Express middleware to handle errors
 */
export function errorHandlerMiddleware(
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
) {
  // Extract request ID if available
  const requestId = (req as any).requestId || 'unknown';
  
  // Log the error
  errorLogger.logError(`Request error: ${err.message}`, err, {
    requestId,
    method: req.method,
    path: req.path,
    query: req.query,
    body: sanitizeRequestBody(req.body),
    ip: req.ip,
    userAgent: req.get('user-agent')
  });
  
  // Determine if this is a trusted error (one thrown intentionally)
  const isTrustedError = err.name === 'AppError' || err.name === 'ValidationError';
  
  // Set status code based on error type
  let statusCode = 500;
  if (isTrustedError) {
    if (err.name === 'ValidationError') {
      statusCode = 400;
    } else if ((err as any).statusCode) {
      statusCode = (err as any).statusCode;
    }
  }
  
  // Return error response
  res.status(statusCode).json({
    error: {
      message: isTrustedError ? err.message : 'An unexpected error occurred',
      requestId,
      ...(process.env.NODE_ENV !== 'production' && { stack: err.stack })
    }
  });
}

/**
 * Sanitize request body to remove sensitive information before logging
 */
function sanitizeRequestBody(body: any): any {
  if (!body) return body;
  
  const sensitiveFields = ['password', 'token', 'secret', 'apiKey', 'creditCard', 'cvv'];
  const sanitized = { ...body };
  
  for (const field of sensitiveFields) {
    if (typeof sanitized[field] !== 'undefined') {
      sanitized[field] = '[REDACTED]';
    }
  }
  
  return sanitized;
}

/**
 * Create a custom application error
 */
export class AppError extends Error {
  statusCode: number;
  
  constructor(message: string, statusCode = 500) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    
    // Capture stack trace
    Error.captureStackTrace(this, this.constructor);
  }
}