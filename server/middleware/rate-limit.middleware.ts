/**
 * Rate Limiting Middleware
 * 
 * This middleware provides rate limiting functionality to protect APIs from abuse:
 * - Limits requests based on IP address or custom keys
 * - Configurable limits for different endpoints
 * - Proper error responses with retry information
 * - Memory-based storage for tracking requests
 * 
 * Usage examples:
 * 
 * // Apply standard API rate limit to a route or router
 * router.use(standardLimiter);
 * 
 * // Apply strict rate limit to sensitive endpoints
 * router.post('/login', strictAuthLimiter, loginHandler);
 */

import rateLimit, { Options } from 'express-rate-limit';
import { Request, Response, NextFunction } from 'express';
import { createLogger } from '../services/logger';

const logger = createLogger('rate-limit');

// Base configuration for all rate limiters
const baseConfig: Partial<Options> = {
  // Return rate limit info in headers
  standardHeaders: true,
  // Use recommended headers for compatibility
  legacyHeaders: false,
  // Skip if running tests
  skip: () => process.env.NODE_ENV === 'test',
  // Handler for when rate limit is exceeded
  handler: (req: Request, res: Response) => {
    const retryAfter = res.getHeader('Retry-After') || 60;
    
    logger.warn('Rate limit exceeded', {
      ip: req.ip,
      path: req.path,
      method: req.method,
      retryAfter
    });
    
    return res.status(429).json({
      error: {
        message: 'Too many requests, please try again later',
        code: 'RATE_LIMIT_EXCEEDED',
        retryAfter
      }
    });
  }
};

/**
 * Standard API rate limiter for general requests
 * Allows 100 requests per minute per IP address
 */
export const standardLimiter = rateLimit({
  ...baseConfig,
  windowMs: 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute
  message: 'Too many requests from this IP, please try again after a minute',
});

/**
 * Strict rate limiter for authentication endpoints
 * Allows 10 requests per minute per IP address
 * Used for login, registration, and password reset to prevent brute force attacks
 */
export const strictAuthLimiter = rateLimit({
  ...baseConfig,
  windowMs: 60 * 1000, // 1 minute
  max: 10, // 10 requests per minute
  message: 'Too many authentication attempts, please try again after a minute',
});

/**
 * Very strict rate limiter for sensitive operations
 * Allows only 5 requests per 15 minutes per IP address
 * Used for password reset requests, account deletion, etc.
 */
export const sensitiveOperationLimiter = rateLimit({
  ...baseConfig,
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 requests per 15 minutes
  message: 'Too many sensitive operation attempts, please try again later',
});

/**
 * Custom key generator function to limit by user ID if available, or IP otherwise
 * This helps prevent one user from affecting rate limits of others on shared networks
 */
function getUserKeyGenerator(req: Request): string {
  // Use user ID if authenticated
  if (req.isAuthenticated && req.user?.id) {
    return `user:${req.user.id}`;
  }
  
  // Use anonymous session ID if available
  if (req.anonymousSessionId) {
    return `anon:${req.anonymousSessionId}`;
  }
  
  // Fall back to IP address
  return `ip:${req.ip}`;
}

/**
 * User-based rate limiter for actions specific to a user (not authentication)
 * Allows 60 requests per minute per user (or IP if not authenticated)
 */
export const userBasedLimiter = rateLimit({
  ...baseConfig,
  windowMs: 60 * 1000, // 1 minute
  max: 60, // 60 requests per minute
  keyGenerator: getUserKeyGenerator,
  message: 'Too many requests, please try again after a minute',
});

/**
 * User-based strict rate limiter for expensive operations
 * Allows 30 requests per 5 minutes per user (or IP if not authenticated)
 * Used for operations that consume significant server resources
 */
export const expensiveOperationLimiter = rateLimit({
  ...baseConfig,
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 30, // 30 requests per 5 minutes
  keyGenerator: getUserKeyGenerator,
  message: 'Too many requests for this operation, please try again later',
});

export default {
  standardLimiter,
  strictAuthLimiter,
  sensitiveOperationLimiter,
  userBasedLimiter,
  expensiveOperationLimiter
};