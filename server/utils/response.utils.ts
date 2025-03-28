/**
 * API Response Utilities
 * 
 * This module provides standardized functions for API responses
 * to ensure consistent response formats throughout the application.
 */

import { Response } from 'express';
import { AuthError } from '../services/auth.service';
import { createLogger } from '../services/logger';

const logger = createLogger('api-response');

/**
 * Standard error response interface
 */
export interface ErrorResponse {
  error: {
    message: string;
    code: string;
    details?: any;
  };
}

/**
 * Standard success response interface
 */
export interface SuccessResponse<T = any> {
  data: T;
  message?: string;
}

/**
 * Send a standardized success response
 * 
 * @param res Express response object
 * @param data Data to include in the response
 * @param message Optional success message
 * @param statusCode HTTP status code (default: 200)
 */
export function apiSuccess<T = any>(
  res: Response,
  data: T,
  message?: string,
  statusCode: number = 200
): Response {
  const response: SuccessResponse<T> = {
    data,
    ...(message && { message })
  };

  return res.status(statusCode).json(response);
}

/**
 * Send a standardized error response
 * 
 * @param res Express response object
 * @param error Error object or message
 * @param code Error code
 * @param statusCode HTTP status code (default: 400)
 * @param details Additional error details
 */
export function apiError(
  res: Response,
  error: Error | string,
  code: string = 'INTERNAL_ERROR',
  statusCode: number = 400,
  details?: any
): Response {
  // Extract message from error object if provided
  const message = typeof error === 'string' ? error : error.message;
  
  // Handle AuthError errors with their predefined status codes
  if (error instanceof AuthError) {
    code = error.code;
    statusCode = error.status;
  }

  const response: ErrorResponse = {
    error: {
      message,
      code,
      ...(details && { details })
    }
  };

  // Log error responses (except validation errors which are common)
  if (statusCode >= 500 || (statusCode >= 400 && code !== 'VALIDATION_ERROR')) {
    logger.error('API error response', {
      statusCode,
      errorCode: code,
      message,
      ...(details && { details })
    });
  }

  return res.status(statusCode).json(response);
}

/**
 * Send a not found response
 * 
 * @param res Express response object
 * @param message Custom not found message
 * @param code Error code (default: RESOURCE_NOT_FOUND)
 */
export function apiNotFound(
  res: Response,
  message: string = 'Resource not found',
  code: string = 'RESOURCE_NOT_FOUND'
): Response {
  return apiError(res, message, code, 404);
}

/**
 * Send an unauthorized response
 * 
 * @param res Express response object
 * @param message Custom unauthorized message
 * @param code Error code (default: UNAUTHORIZED)
 */
export function apiUnauthorized(
  res: Response,
  message: string = 'Unauthorized',
  code: string = 'UNAUTHORIZED'
): Response {
  return apiError(res, message, code, 401);
}

/**
 * Send a forbidden response
 * 
 * @param res Express response object
 * @param message Custom forbidden message
 * @param code Error code (default: FORBIDDEN)
 */
export function apiForbidden(
  res: Response,
  message: string = 'Forbidden',
  code: string = 'FORBIDDEN'
): Response {
  return apiError(res, message, code, 403);
}

/**
 * Send a validation error response
 * 
 * @param res Express response object
 * @param errors Validation errors
 * @param message Custom validation error message
 */
export function apiValidationError(
  res: Response,
  errors: any,
  message: string = 'Validation error'
): Response {
  return apiError(res, message, 'VALIDATION_ERROR', 400, { errors });
}

/**
 * Send a server error response
 * 
 * @param res Express response object
 * @param error Error object or message
 * @param code Error code (default: SERVER_ERROR)
 */
export function apiServerError(
  res: Response,
  error: Error | string,
  code: string = 'SERVER_ERROR'
): Response {
  return apiError(res, error, code, 500);
}

/**
 * Send a redirect response with a message
 * 
 * @param res Express response object
 * @param url URL to redirect to
 * @param message Message to include
 * @param statusCode HTTP status code (default: 302)
 */
export function apiRedirect(
  res: Response,
  url: string,
  message: string = 'Redirect',
  statusCode: number = 302
): void {
  res.status(statusCode).json({
    redirect: url,
    message
  });
}

/**
 * Send a success created response (201)
 * 
 * @param res Express response object
 * @param data Data to include in the response
 * @param message Optional success message
 */
export function apiCreated<T = any>(
  res: Response,
  data: T,
  message: string = 'Resource created successfully'
): Response {
  return apiSuccess(res, data, message, 201);
}

/**
 * Send a success no content response (204)
 * 
 * @param res Express response object
 */
export function apiNoContent(res: Response): Response {
  return res.status(204).end();
}

// Export all response utilities
export default {
  apiSuccess,
  apiError,
  apiNotFound,
  apiUnauthorized,
  apiForbidden,
  apiValidationError,
  apiServerError,
  apiRedirect,
  apiCreated,
  apiNoContent
};