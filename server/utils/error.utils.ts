/**
 * Error handling utilities
 * 
 * This module provides error handling utilities for the application.
 * It includes:
 * - Base ApplicationError class that extends Error
 * - Specialized error types for different scenarios
 * - Error wrapping and formatting functions
 */

import { createLogger } from '../services/logger';

const logger = createLogger('error-utils');

/**
 * Standard error codes for consistent error reporting
 */
export enum ErrorCode {
  // Authentication errors
  UNAUTHORIZED = 'UNAUTHORIZED',
  INVALID_CREDENTIALS = 'INVALID_CREDENTIALS',
  ACCOUNT_LOCKED = 'ACCOUNT_LOCKED',
  SESSION_EXPIRED = 'SESSION_EXPIRED',
  TOKEN_EXPIRED = 'TOKEN_EXPIRED',
  INVALID_TOKEN = 'INVALID_TOKEN',
  EMAIL_NOT_VERIFIED = 'EMAIL_NOT_VERIFIED',
  
  // Authorization errors
  FORBIDDEN = 'FORBIDDEN',
  INSUFFICIENT_PERMISSIONS = 'INSUFFICIENT_PERMISSIONS',
  
  // Resource errors
  RESOURCE_NOT_FOUND = 'RESOURCE_NOT_FOUND',
  RESOURCE_ALREADY_EXISTS = 'RESOURCE_ALREADY_EXISTS',
  RESOURCE_CONFLICT = 'RESOURCE_CONFLICT',
  
  // Validation errors
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  INVALID_INPUT = 'INVALID_INPUT',
  MISSING_REQUIRED_FIELD = 'MISSING_REQUIRED_FIELD',
  
  // Service errors
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
  DATABASE_ERROR = 'DATABASE_ERROR',
  EXTERNAL_SERVICE_ERROR = 'EXTERNAL_SERVICE_ERROR',
  
  // Rate limiting and quotas
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  QUOTA_EXCEEDED = 'QUOTA_EXCEEDED',
  ANONYMOUS_LIMIT_REACHED = 'ANONYMOUS_LIMIT_REACHED',
  
  // General errors
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  NOT_IMPLEMENTED = 'NOT_IMPLEMENTED',
  BAD_REQUEST = 'BAD_REQUEST'
}

/**
 * Base application error class
 * Extends the built-in Error class with additional properties
 */
export class ApplicationError extends Error {
  status: number;
  code: string;
  details?: any;
  
  constructor(message: string, code = 'APPLICATION_ERROR', status = 500, details?: any) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.status = status;
    this.details = details;
    
    // This is needed to make instanceof work correctly with ES5
    Object.setPrototypeOf(this, ApplicationError.prototype);
  }
  
  /**
   * Convert the error to a plain object for JSON serialization
   */
  toJSON() {
    return {
      error: {
        message: this.message,
        code: this.code,
        status: this.status,
        ...(this.details && { details: this.details })
      }
    };
  }
}

/**
 * Error when a required resource is not found
 */
export class NotFoundError extends ApplicationError {
  constructor(message = 'Resource not found', details?: any) {
    super(message, 'RESOURCE_NOT_FOUND', 404, details);
    Object.setPrototypeOf(this, NotFoundError.prototype);
  }
}

/**
 * Error for validation failures
 */
export class ValidationError extends ApplicationError {
  constructor(message = 'Validation error', details?: any) {
    super(message, 'VALIDATION_ERROR', 400, details);
    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}

/**
 * Error for authorization failures
 */
export class AuthorizationError extends ApplicationError {
  constructor(message = 'Authorization error', details?: any) {
    super(message, 'AUTHORIZATION_ERROR', 403, details);
    Object.setPrototypeOf(this, AuthorizationError.prototype);
  }
}

/**
 * Error for database failures
 */
export class DatabaseError extends ApplicationError {
  constructor(message = 'Database error', details?: any) {
    super(message, 'DATABASE_ERROR', 500, details);
    Object.setPrototypeOf(this, DatabaseError.prototype);
  }
}

/**
 * Error for external service failures
 */
export class ExternalServiceError extends ApplicationError {
  constructor(message = 'External service error', details?: any) {
    super(message, 'EXTERNAL_SERVICE_ERROR', 502, details);
    Object.setPrototypeOf(this, ExternalServiceError.prototype);
  }
}

/**
 * Error for rate limiting
 */
export class RateLimitError extends ApplicationError {
  constructor(message = 'Rate limit exceeded', details?: any) {
    super(message, 'RATE_LIMIT_EXCEEDED', 429, details);
    Object.setPrototypeOf(this, RateLimitError.prototype);
  }
}

/**
 * Error for anonymous users reaching their resource limits
 */
export class AnonymousLimitError extends ApplicationError {
  constructor(message = 'Anonymous user limit reached', details?: any) {
    super(message, 'ANONYMOUS_LIMIT_REACHED', 403, details);
    Object.setPrototypeOf(this, AnonymousLimitError.prototype);
  }
}

/**
 * Wrap an unknown error in an ApplicationError
 * @param error The original error
 * @param defaultMessage Optional default message if the error doesn't have one
 * @returns An ApplicationError instance
 */
export function wrapError(error: any, defaultMessage = 'An unexpected error occurred'): ApplicationError {
  // If it's already an ApplicationError, return it
  if (error instanceof ApplicationError) {
    return error;
  }
  
  // Handle other known error types
  if (error instanceof Error) {
    // Extract the message
    const message = error.message || defaultMessage;
    
    // Log the original error stack
    logger.error('Error wrapped', {
      originalError: error.name,
      message: error.message,
      stack: error.stack
    });
    
    return new ApplicationError(message);
  }
  
  // For non-Error objects or primitive values
  const message = error?.toString() || defaultMessage;
  logger.error('Non-error wrapped', { original: error });
  
  return new ApplicationError(message);
}

/**
 * Create a validation error with formatted field errors
 * @param fieldErrors Object with field names as keys and error messages as values
 * @param message Optional custom overall message
 * @returns A ValidationError instance
 */
export function createValidationError(fieldErrors: Record<string, string>, message?: string): ValidationError {
  return new ValidationError(
    message || 'Validation failed',
    { fields: fieldErrors }
  );
}

/**
 * Format an error for logging or API responses
 * @param error The error to format
 * @returns Formatted error object
 */
export function formatError(error: any): Record<string, any> {
  if (error instanceof ApplicationError) {
    return error.toJSON();
  }
  
  if (error instanceof Error) {
    return {
      error: {
        message: error.message || 'Unknown error',
        code: 'INTERNAL_ERROR',
        status: 500
      }
    };
  }
  
  return {
    error: {
      message: String(error) || 'Unknown error',
      code: 'INTERNAL_ERROR',
      status: 500
    }
  };
}

/**
 * Higher-order function that wraps an async route handler to catch errors
 * @param fn The async route handler function
 * @returns A route handler that catches and processes errors
 */
export function asyncHandler(fn: Function) {
  return async function(req: any, res: any, next: any) {
    try {
      await fn(req, res, next);
    } catch (error) {
      next(error);
    }
  };
}

export default {
  ApplicationError,
  NotFoundError,
  ValidationError,
  AuthorizationError,
  DatabaseError,
  ExternalServiceError,
  RateLimitError,
  AnonymousLimitError,
  ErrorCode,
  wrapError,
  createValidationError,
  formatError,
  asyncHandler
};