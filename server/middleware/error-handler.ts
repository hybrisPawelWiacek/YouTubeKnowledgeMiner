/**
 * Global Error Handler Middleware
 * 
 * This middleware catches all errors thrown in route handlers and
 * formats them consistently for API responses.
 */

import { Request, Response, NextFunction } from 'express';
import { formatError, ApplicationError } from '../utils/error.utils';
import { ZodError } from 'zod';
import { AuthError } from '../services/auth.service';
import { createLogger } from '../services/logger';

const logger = createLogger('error-handler');

/**
 * Formats Zod validation errors into a more user-friendly structure
 * @param error The Zod error to format
 * @returns Formatted error object
 */
function formatZodError(error: ZodError) {
  // Extract the field errors into a simple object format
  const fieldErrors: Record<string, string> = {};
  
  error.errors.forEach((err) => {
    const path = err.path.join('.');
    fieldErrors[path] = err.message;
  });
  
  return {
    error: {
      message: 'Validation error',
      code: 'VALIDATION_ERROR',
      status: 400,
      details: { fields: fieldErrors }
    }
  };
}

/**
 * Global error handler middleware
 */
export function errorHandler(err: any, req: Request, res: Response, next: NextFunction) {
  // Skip if headers already sent
  if (res.headersSent) {
    logger.warn('Headers already sent, skipping error handler');
    return next(err);
  }
  
  // Log the error with details
  if (err instanceof Error) {
    // Don't log stack traces for validation errors or expected auth errors
    const isExpectedError = err instanceof ZodError || err instanceof AuthError;
    
    if (!isExpectedError) {
      logger.error('Request error', {
        path: req.path,
        method: req.method,
        error: err.message,
        stack: err.stack
      });
    } else {
      logger.warn('Client error', {
        path: req.path,
        method: req.method,
        error: err.message
      });
    }
  } else {
    logger.error('Unknown error type', {
      path: req.path,
      method: req.method,
      error: err
    });
  }
  
  // Handle Zod validation errors
  if (err instanceof ZodError) {
    return res.status(400).json(formatZodError(err));
  }
  
  // Handle application errors with their specific status codes
  if (err instanceof ApplicationError) {
    return res.status(err.status).json(formatError(err));
  }
  
  // Handle authentication errors with their specific status codes
  if (err instanceof AuthError) {
    return res.status(err.status).json({
      error: {
        message: err.message,
        code: err.code
      }
    });
  }
  
  // Handle JWT token errors
  if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    return res.status(401).json({
      error: {
        message: 'Invalid or expired token',
        code: 'INVALID_TOKEN'
      }
    });
  }
  
  // Handle other errors with a generic 500 response
  const statusCode = err.status || err.statusCode || 500;
  const errorMessage = err.message || 'Internal server error';
  const errorCode = err.code || 'SERVER_ERROR';
  
  return res.status(statusCode).json({
    error: {
      message: errorMessage,
      code: errorCode
    }
  });
}

// 404 handler for routes that don't match any handlers
export function notFoundHandler(req: Request, res: Response) {
  logger.warn('Route not found', { 
    path: req.path,
    method: req.method
  });
  
  res.status(404).json({
    error: {
      message: `Route not found: ${req.method} ${req.path}`,
      code: 'ROUTE_NOT_FOUND'
    }
  });
}

export default { errorHandler, notFoundHandler };