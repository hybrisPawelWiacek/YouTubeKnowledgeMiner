/**
 * Authentication Middleware
 * 
 * This middleware provides:
 * - Authentication checking for protected routes
 * - Support for both authenticated and anonymous sessions
 * - Validation of session tokens
 * 
 * Usage examples:
 * 
 * // Require authentication (registered users only)
 * router.get('/protected', requireAuth, (req, res) => { ... })
 * 
 * // Require any valid session (anonymous or authenticated)
 * router.get('/semi-protected', requireSession, (req, res) => { ... })
 * 
 * // Optional authentication (attaches user if available)
 * router.get('/public', authenticateUser, (req, res) => { ... })
 */

import { Request, Response, NextFunction } from 'express';
import { authService, SessionError, AuthError } from '../services/auth.service';
import { sessionService } from '../services/session.service';
import { createLogger } from '../services/logger';

const logger = createLogger('auth-middleware');

// Extend Express Request type to include user and session properties
declare global {
  namespace Express {
    interface Request {
      user?: any;
      isAuthenticated: boolean;
      anonymousSessionId?: string;
      videoCount?: number;
    }
    
    interface Response {
      locals: {
        userInfo?: {
          user_id: number | null;
          is_anonymous: boolean;
          anonymous_session_id: string | null;
          video_count: number;
          username?: string;
          email?: string;
          is_verified?: boolean;
          role?: string;
          [key: string]: any;
        };
        [key: string]: any;
      }
    }
  }
}

/**
 * Middleware that attempts to authenticate the user from session cookies
 * This doesn't block requests if no valid session exists
 */
export async function authenticateUser(req: Request, res: Response, next: NextFunction) {
  try {
    // Default authentication state
    req.isAuthenticated = false;
    
    // Check for authenticated user session via cookie
    const userSessionToken = req.cookies['authToken'];
    
    if (userSessionToken) {
      try {
        logger.debug('Found user session cookie, validating');
        // Validate user session and get associated user
        const { user, session } = await authService.validateUserSession(userSessionToken);
        
        if (user) {
          logger.debug('User authenticated via cookie', { userId: user.id });
          
          // Attach user and auth status to request object
          req.user = user;
          req.isAuthenticated = true;
          
          // Update session last active time
          await sessionService.updateUserSessionActivity(session.id);
        }
      } catch (error) {
        // Clear invalid session cookie
        if (error instanceof SessionError) {
          logger.warn('Invalid session token, clearing cookie', { 
            error: error.message 
          });
          res.clearCookie('authToken');
        } else {
          logger.error('Authentication error', { 
            error: error instanceof Error ? error.message : String(error) 
          });
        }
      }
    }
    
    // Check for anonymous session cookie if not authenticated
    if (!req.isAuthenticated) {
      const anonymousSessionId = req.cookies['anonymousSessionId'];
      
      if (anonymousSessionId) {
        try {
          logger.debug('Found anonymous session cookie', { anonymousSessionId });
          
          // Get session and update last active time
          const session = await sessionService.getAnonymousSession(anonymousSessionId);
          
          if (session) {
            logger.debug('Valid anonymous session', { 
              sessionId: anonymousSessionId,
              videoCount: session.video_count 
            });
            
            // Attach session info to request
            req.anonymousSessionId = anonymousSessionId;
            req.videoCount = session.video_count;
            
            // Update session last active time
            await sessionService.updateAnonymousSessionActivity(anonymousSessionId);
          } else {
            // Invalid anonymous session ID, clear the cookie
            logger.debug('Invalid anonymous session, clearing cookie');
            res.clearCookie('anonymousSessionId');
          }
        } catch (error) {
          logger.error('Error processing anonymous session', { 
            error: error instanceof Error ? error.message : String(error),
            anonymousSessionId 
          });
        }
      }
    }
    
    // Continue to the next middleware or route handler
    next();
  } catch (error) {
    logger.error('Unhandled error in authentication middleware', { 
      error: error instanceof Error ? error.message : String(error) 
    });
    next(error);
  }
}

/**
 * Middleware that requires a valid authenticated user session
 * Rejects requests without a valid registered user session
 */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.isAuthenticated || !req.user) {
    logger.warn('Authentication required', { 
      path: req.path,
      isAuthenticated: req.isAuthenticated,
      hasUser: !!req.user 
    });
    
    return res.status(401).json({
      error: {
        message: 'Authentication required to access this resource',
        code: 'AUTH_REQUIRED'
      }
    });
  }
  
  // User is authenticated, proceed
  next();
}

/**
 * Middleware that requires any valid session (authenticated or anonymous)
 * Rejects requests without any kind of session
 */
export function requireSession(req: Request, res: Response, next: NextFunction) {
  if (!req.isAuthenticated && !req.anonymousSessionId) {
    logger.warn('Session required', { 
      path: req.path,
      isAuthenticated: req.isAuthenticated,
      hasAnonymousSession: !!req.anonymousSessionId
    });
    
    return res.status(401).json({
      error: {
        message: 'Valid session required to access this resource',
        code: 'SESSION_REQUIRED'
      }
    });
  }
  
  // Valid session exists, proceed
  next();
}

/**
 * Middleware to check if an anonymous user has reached their usage limit
 * Used to limit features for anonymous users
 */
export async function checkAnonymousLimit(
  req: Request, 
  res: Response, 
  next: NextFunction,
  limit: number = 3
) {
  // Skip check for authenticated users
  if (req.isAuthenticated) {
    return next();
  }
  
  // Check anonymous session limit if it exists
  if (req.anonymousSessionId) {
    try {
      const limitReached = await sessionService.hasReachedAnonymousLimit(
        req.anonymousSessionId,
        limit
      );
      
      if (limitReached) {
        logger.info('Anonymous user reached limit', { 
          anonymousSessionId: req.anonymousSessionId,
          limit,
          path: req.path
        });
        
        return res.status(403).json({
          error: {
            message: 'Anonymous user limit reached. Please register to continue.',
            code: 'ANONYMOUS_LIMIT_REACHED',
            details: {
              currentCount: req.videoCount || 0,
              limit
            }
          }
        });
      }
    } catch (error) {
      logger.error('Error checking anonymous limit', { 
        error: error instanceof Error ? error.message : String(error),
        anonymousSessionId: req.anonymousSessionId
      });
      
      // Default to limit reached on error to prevent abuse
      return res.status(403).json({
        error: {
          message: 'Unable to verify anonymous session limit. Please register to continue.',
          code: 'ANONYMOUS_VERIFICATION_FAILED'
        }
      });
    }
  }
  
  // Limit not reached or no session - proceed
  next();
}

/**
 * Factory function to create role-based authorization middleware
 * @param roles Array of roles that are allowed access
 * @returns Middleware function that checks user roles
 */
export function requireRole(roles: string[]) {
  return function(req: Request, res: Response, next: NextFunction) {
    // First check if user is authenticated
    if (!req.isAuthenticated || !req.user) {
      return res.status(401).json({
        error: {
          message: 'Authentication required to access this resource',
          code: 'AUTH_REQUIRED'
        }
      });
    }
    
    // Check if user has one of the required roles
    if (!roles.includes(req.user.role)) {
      logger.warn('Permission denied', { 
        userId: req.user.id,
        userRole: req.user.role,
        requiredRoles: roles,
        path: req.path
      });
      
      return res.status(403).json({
        error: {
          message: 'You do not have permission to access this resource',
          code: 'PERMISSION_DENIED'
        }
      });
    }
    
    // User has required role, proceed
    next();
  };
}

/**
 * Middleware that extracts user information and stores it in res.locals.userInfo
 * This provides a consistent way to access user data in route handlers
 */
export function getUserInfo(req: Request, res: Response, next: NextFunction) {
  try {
    // Initialize userInfo object
    res.locals.userInfo = {
      user_id: null,
      is_anonymous: true,
      anonymous_session_id: null,
      video_count: 0
    };
    
    // If user is authenticated, add user data
    if (req.isAuthenticated && req.user) {
      res.locals.userInfo = {
        user_id: req.user.id,
        is_anonymous: false,
        anonymous_session_id: null,
        video_count: 0,
        username: req.user.username,
        email: req.user.email,
        is_verified: req.user.is_verified,
        role: req.user.role
      };
    } 
    // Otherwise check for anonymous session
    else if (req.anonymousSessionId) {
      res.locals.userInfo = {
        user_id: null,
        is_anonymous: true,
        anonymous_session_id: req.anonymousSessionId,
        video_count: req.videoCount || 0
      };
    }
    
    // Continue to next middleware
    next();
  } catch (error) {
    logger.error('Error in getUserInfo middleware', { 
      error: error instanceof Error ? error.message : String(error) 
    });
    next(error);
  }
}

/**
 * Helper function to get user ID from request
 * Returns the user ID for authenticated users or null for anonymous users
 * 
 * @param req Express request object
 * @returns The user ID for authenticated users or null for anonymous users
 */
export async function getUserIdFromRequest(req: Request): Promise<number | null> {
  // For authenticated users, return the user ID
  if (req.isAuthenticated && req.user) {
    return req.user.id;
  }
  
  // For anonymous users or no session, return null
  return null;
}

// No default export, only named exports