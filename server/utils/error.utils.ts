/**
 * Custom error types and error handling utilities
 */

/**
 * Error codes enumeration for better categorization and handling
 */
export enum ErrorCode {
  // Authentication errors
  AUTH_REQUIRED = 'AUTH_REQUIRED',
  INVALID_CREDENTIALS = 'INVALID_CREDENTIALS',
  USER_NOT_FOUND = 'USER_NOT_FOUND',
  USER_EXISTS = 'USER_EXISTS',
  EMAIL_EXISTS = 'EMAIL_EXISTS',
  USERNAME_EXISTS = 'USERNAME_EXISTS',
  EMAIL_NOT_VERIFIED = 'EMAIL_NOT_VERIFIED',
  
  // Session errors
  SESSION_REQUIRED = 'SESSION_REQUIRED',
  SESSION_EXPIRED = 'SESSION_EXPIRED',
  SESSION_INVALID = 'SESSION_INVALID',
  
  // Request validation errors
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  
  // Resource errors
  RESOURCE_NOT_FOUND = 'RESOURCE_NOT_FOUND',
  RESOURCE_CONFLICT = 'RESOURCE_CONFLICT',
  
  // Permission errors
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  
  // Server errors
  SERVER_ERROR = 'SERVER_ERROR',
  DATABASE_ERROR = 'DATABASE_ERROR',
  EXTERNAL_SERVICE_ERROR = 'EXTERNAL_SERVICE_ERROR',
  
  // Rate limiting
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  
  // Validation errors
  INVALID_INPUT = 'INVALID_INPUT',
  
  // Generic errors
  UNKNOWN_ERROR = 'UNKNOWN_ERROR'
}

/**
 * Base API error class with standard properties
 */
export class ApiError extends Error {
  public readonly code: ErrorCode;
  public readonly statusCode: number;
  public readonly details?: Record<string, any>;
  
  constructor(
    message: string, 
    code: ErrorCode = ErrorCode.UNKNOWN_ERROR,
    statusCode: number = 500,
    details?: Record<string, any>
  ) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    
    // Required for instanceof to work correctly when extending Error
    Object.setPrototypeOf(this, ApiError.prototype);
  }
  
  /**
   * Convert error to a JSON-friendly object for API responses
   */
  public toJSON(): Record<string, any> {
    return {
      error: {
        message: this.message,
        code: this.code,
        ...(this.details && { details: this.details })
      }
    };
  }
}

/**
 * Authentication error for auth-related issues
 */
export class AuthenticationError extends ApiError {
  constructor(
    message: string, 
    code: ErrorCode = ErrorCode.AUTH_REQUIRED,
    details?: Record<string, any>
  ) {
    super(message, code, 401, details);
    Object.setPrototypeOf(this, AuthenticationError.prototype);
  }
}

/**
 * Session error for session-related issues
 */
export class SessionError extends ApiError {
  constructor(
    message: string, 
    code: ErrorCode = ErrorCode.SESSION_REQUIRED,
    details?: Record<string, any>
  ) {
    super(message, code, 401, details);
    Object.setPrototypeOf(this, SessionError.prototype);
  }
}

/**
 * Validation error for invalid input
 */
export class ValidationError extends ApiError {
  constructor(
    message: string, 
    details?: Record<string, any>
  ) {
    super(message, ErrorCode.VALIDATION_ERROR, 400, details);
    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}

/**
 * Not found error for missing resources
 */
export class NotFoundError extends ApiError {
  constructor(
    message: string, 
    details?: Record<string, any>
  ) {
    super(message, ErrorCode.RESOURCE_NOT_FOUND, 404, details);
    Object.setPrototypeOf(this, NotFoundError.prototype);
  }
}

/**
 * Permission error for access control issues
 */
export class PermissionError extends ApiError {
  constructor(
    message: string, 
    details?: Record<string, any>
  ) {
    super(message, ErrorCode.PERMISSION_DENIED, 403, details);
    Object.setPrototypeOf(this, PermissionError.prototype);
  }
}

/**
 * Conflict error for resource conflicts
 */
export class ConflictError extends ApiError {
  constructor(
    message: string, 
    details?: Record<string, any>
  ) {
    super(message, ErrorCode.RESOURCE_CONFLICT, 409, details);
    Object.setPrototypeOf(this, ConflictError.prototype);
  }
}

/**
 * Rate limit error for rate limiting
 */
export class RateLimitError extends ApiError {
  constructor(
    message: string, 
    details?: Record<string, any>
  ) {
    super(message, ErrorCode.RATE_LIMIT_EXCEEDED, 429, details);
    Object.setPrototypeOf(this, RateLimitError.prototype);
  }
}

/**
 * Anonymous user limit error
 * Used when anonymous users reach their usage limits
 */
export class AnonymousLimitError extends ApiError {
  constructor(
    message: string = 'Anonymous user limit reached. Please register to continue.', 
    details?: string | Record<string, any>
  ) {
    // If details is a string, convert it to an object
    const detailsObj = typeof details === 'string' 
      ? { description: details } 
      : details;
    
    super(message, ErrorCode.RATE_LIMIT_EXCEEDED, 429, detailsObj);
    Object.setPrototypeOf(this, AnonymousLimitError.prototype);
  }
}

/**
 * Server error for internal server issues
 */
export class ServerError extends ApiError {
  constructor(
    message: string, 
    code: ErrorCode = ErrorCode.SERVER_ERROR,
    details?: Record<string, any>
  ) {
    super(message, code, 500, details);
    Object.setPrototypeOf(this, ServerError.prototype);
  }
}

/**
 * Database error for database-related issues
 */
export class DatabaseError extends ServerError {
  constructor(
    message: string, 
    details?: Record<string, any>
  ) {
    super(message, ErrorCode.DATABASE_ERROR, details);
    Object.setPrototypeOf(this, DatabaseError.prototype);
  }
}

/**
 * External service error for issues with external services
 */
export class ExternalServiceError extends ServerError {
  constructor(
    message: string, 
    details?: Record<string, any>
  ) {
    super(message, ErrorCode.EXTERNAL_SERVICE_ERROR, details);
    Object.setPrototypeOf(this, ExternalServiceError.prototype);
  }
}