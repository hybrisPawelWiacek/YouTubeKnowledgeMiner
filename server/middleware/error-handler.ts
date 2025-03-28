/**
 * Error Handler Middleware
 * 
 * This middleware provides centralized error handling for the application.
 * It logs detailed error information and responds with appropriate error messages.
 */

import { Request, Response, NextFunction } from 'express';
import { createLogger } from '../services/logger';

const errorLogger = createLogger('error');

/**
 * Custom error class for API errors
 */
export class ApiError extends Error {
  statusCode: number;
  
  constructor(message: string, statusCode: number = 500) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
  }
}

/**
 * Handle API errors by logging them and sending appropriate responses
 */
export function errorHandlerMiddleware(
  error: Error | ApiError,
  req: Request,
  res: Response,
  next: NextFunction
) {
  // Default status code
  let statusCode = 500;
  
  // Check if it's an API error
  if (error instanceof ApiError) {
    statusCode = error.statusCode;
  }
  
  // Log details based on error severity
  if (statusCode >= 500) {
    // Server errors
    errorLogger.error(`Server Error: ${error.message}`, {
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack
      },
      request: {
        method: req.method,
        path: req.path,
        params: req.params,
        query: req.query,
        ip: req.ip,
        requestId: (req as any).id
      }
    });
  } else {
    // Client errors
    errorLogger.warn(`Client Error: ${error.message}`, {
      error: {
        name: error.name,
        message: error.message
      },
      request: {
        method: req.method,
        path: req.path,
        params: req.params,
        query: req.query,
        requestId: (req as any).id
      }
    });
  }
  
  // Customize response based on environment
  let responseMessage = error.message;
  let responseDetails = undefined;
  
  // In development, include more details
  if (process.env.NODE_ENV !== 'production') {
    responseDetails = {
      name: error.name,
      stack: error.stack
    };
  }
  
  // Send response
  res.status(statusCode).json({
    error: responseMessage,
    ...(responseDetails ? { details: responseDetails } : {})
  });
}

export default errorHandlerMiddleware;