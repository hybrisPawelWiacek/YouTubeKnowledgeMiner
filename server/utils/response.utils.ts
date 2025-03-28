/**
 * Response utilities for consistent API responses
 */

import { Response } from 'express';
import { ApiError, ErrorCode } from './error.utils';
import { ZodError } from 'zod';
import { createLogger } from '../services/logger';

const logger = createLogger('api');

/**
 * Standard API success response
 * 
 * @param res Express Response object
 * @param data Data to include in the response
 * @param statusCode HTTP status code (default: 200)
 */
export function apiSuccess(
  res: Response, 
  data: any, 
  statusCode: number = 200
) {
  return res.status(statusCode).json(data);
}

/**
 * Standard API created response
 * 
 * @param res Express Response object
 * @param data Data to include in the response
 */
export function apiCreated(res: Response, data: any) {
  return apiSuccess(res, data, 201);
}

/**
 * Legacy success response format (for backward compatibility)
 * @deprecated Use apiSuccess instead
 */
export function sendSuccess(
  res: Response, 
  data: any, 
  statusCode: number = 200
) {
  return res.status(statusCode).json(data);
}

/**
 * Legacy error response format (for backward compatibility)
 * @deprecated Use handleApiError with ApiError instead
 */
export function sendError(
  res: Response, 
  message: string, 
  statusCode: number = 500, 
  code: string = 'UNKNOWN_ERROR',
  details?: any
) {
  return res.status(statusCode).json({
    error: {
      message,
      code,
      ...(details && { details })
    }
  });
}

/**
 * Standard API error response
 * 
 * @param res Express Response object
 * @param error Error to handle
 */
export function handleApiError(res: Response, error: unknown) {
  // Already an ApiError instance - use its statusCode and serialization
  if (error instanceof ApiError) {
    return res.status(error.statusCode).json(error.toJSON());
  }
  
  // ZodError - convert to validation error response
  if (error instanceof ZodError) {
    const validationErrors = error.errors.map(err => ({
      path: err.path.join('.'),
      message: err.message,
    }));
    
    logger.warn('Validation error in request', { validationErrors });
    
    return res.status(400).json({
      error: {
        message: 'Validation error',
        code: ErrorCode.VALIDATION_ERROR,
        details: { validationErrors }
      }
    });
  }
  
  // Standard Error object
  if (error instanceof Error) {
    // Log the full error internally
    logger.error('API error', { error: error.message, stack: error.stack });
    
    // Only send message to client
    return res.status(500).json({
      error: {
        message: error.message,
        code: ErrorCode.SERVER_ERROR
      }
    });
  }
  
  // Unknown error type
  logger.error('Unknown API error', { error });
  
  return res.status(500).json({
    error: {
      message: 'An unexpected error occurred',
      code: ErrorCode.UNKNOWN_ERROR
    }
  });
}