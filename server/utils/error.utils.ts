/**
 * Custom error classes and error handling utilities for the server
 */

/**
 * Standard error codes used across the application
 * These codes help the frontend identify and handle specific error cases
 */
export enum ErrorCode {
  // Authentication errors
  AUTH_REQUIRED = 'AUTH_REQUIRED',
  SESSION_REQUIRED = 'SESSION_REQUIRED',
  SESSION_EXPIRED = 'SESSION_EXPIRED',
  INVALID_CREDENTIALS = 'INVALID_CREDENTIALS',
  
  // Authorization errors
  FORBIDDEN = 'FORBIDDEN',
  
  // Validation errors
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  
  // Resource errors
  RESOURCE_NOT_FOUND = 'RESOURCE_NOT_FOUND',
  RESOURCE_ALREADY_EXISTS = 'RESOURCE_ALREADY_EXISTS',
  
  // Anonymous user specific errors
  ANONYMOUS_LIMIT_REACHED = 'ANONYMOUS_LIMIT_REACHED',
  
  // External service errors
  EXTERNAL_SERVICE_ERROR = 'EXTERNAL_SERVICE_ERROR',
  OPENAI_ERROR = 'OPENAI_ERROR',
  YOUTUBE_ERROR = 'YOUTUBE_ERROR',
  
  // Database errors
  DATABASE_ERROR = 'DATABASE_ERROR',
  
  // Generic errors
  SERVER_ERROR = 'SERVER_ERROR',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR'
}

/**
 * Base API Error class that all other error types extend
 * 
 * This provides consistent error structure and HTTP status code handling
 */
export class ApiError extends Error {
  code: string;
  status: number;
  details?: string;
  
  constructor(message: string, code: string = ErrorCode.SERVER_ERROR, status: number = 500, details?: string) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

/**
 * Authentication error for when a user needs to be logged in
 */
export class AuthenticationError extends ApiError {
  constructor(message: string = 'Authentication required', code: string = ErrorCode.AUTH_REQUIRED, details?: string) {
    super(message, code, 401, details);
    this.name = 'AuthenticationError';
  }
}

/**
 * Session error for when a session is required or has expired
 */
export class SessionError extends ApiError {
  constructor(message: string = 'Session required or expired', code: string = ErrorCode.SESSION_REQUIRED, details?: string) {
    super(message, code, 401, details);
    this.name = 'SessionError';
  }
}

/**
 * Authorization error for when a user doesn't have permission
 */
export class ForbiddenError extends ApiError {
  constructor(message: string = 'You do not have permission to access this resource', details?: string) {
    super(message, ErrorCode.FORBIDDEN, 403, details);
    this.name = 'ForbiddenError';
  }
}

/**
 * Validation error for invalid input data
 */
export class ValidationError extends ApiError {
  constructor(message: string = 'Validation error', details?: string) {
    super(message, ErrorCode.VALIDATION_ERROR, 400, details);
    this.name = 'ValidationError';
  }
}

/**
 * Not found error for missing resources
 */
export class NotFoundError extends ApiError {
  constructor(message: string = 'Resource not found', details?: string) {
    super(message, ErrorCode.RESOURCE_NOT_FOUND, 404, details);
    this.name = 'NotFoundError';
  }
}

/**
 * Error for when anonymous users have reached their limit
 */
export class AnonymousLimitError extends ApiError {
  constructor(message: string = 'Anonymous user limit reached', details?: string) {
    super(message, ErrorCode.ANONYMOUS_LIMIT_REACHED, 403, details);
    this.name = 'AnonymousLimitError';
  }
}

/**
 * Error for external service failures (OpenAI, YouTube, etc.)
 */
export class ExternalServiceError extends ApiError {
  constructor(message: string = 'External service error', code: string = ErrorCode.EXTERNAL_SERVICE_ERROR, details?: string) {
    super(message, code, 502, details);
    this.name = 'ExternalServiceError';
  }
}

/**
 * Error for database failures
 */
export class DatabaseError extends ApiError {
  constructor(message: string = 'Database error', details?: string) {
    super(message, ErrorCode.DATABASE_ERROR, 500, details);
    this.name = 'DatabaseError';
  }
}

/**
 * Helper function to convert any error to an ApiError
 * This ensures consistent error formatting throughout the application
 * 
 * @param error Any error that occurs
 * @returns An ApiError instance
 */
export function normalizeError(error: any): ApiError {
  if (error instanceof ApiError) {
    return error;
  }
  
  // Try to determine error type from error object
  if (error.code) {
    switch (error.code) {
      case 'ECONNREFUSED':
      case 'ETIMEDOUT':
      case 'ENOTFOUND':
        return new ExternalServiceError('External service connection failed', ErrorCode.EXTERNAL_SERVICE_ERROR, error.message);
    }
  }
  
  // Default to generic server error
  return new ApiError(
    error.message || 'An unexpected error occurred',
    ErrorCode.SERVER_ERROR,
    500,
    error.stack
  );
}