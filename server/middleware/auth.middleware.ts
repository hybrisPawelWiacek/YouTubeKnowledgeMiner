import { Request, Response, NextFunction } from 'express';
import { dbStorage } from '../database-storage';
import { ZodError } from 'zod';
import { AuthenticationError, SessionError, ErrorCode } from '../utils/error.utils';
import { handleApiError } from '../utils/response.utils';
import { logger, logAuthEvent } from '../utils/logger';

/**
 * Authentication Middleware
 * 
 * This file contains the middleware and helper functions that integrate
 * all three authentication systems:
 * 
 * 1. Anonymous sessions (/api/anonymous/*)
 * 2. Supabase authentication (/api/supabase-auth/*)
 * 3. Demo user authentication (/api/demo-auth/*)
 * 
 * The middleware provides the glue that allows these systems to coexist
 * and provides uniform authentication checks throughout the application.
 */

/**
 * Middleware to extract and validate user from request
 * Attaches user info to res.locals for use in route handlers
 */
export async function getUserInfo(req: Request, res: Response, next: NextFunction) {
  try {
    const userInfo = await getUserInfoFromRequest(req);
    res.locals.userInfo = userInfo;
    next();
  } catch (error) {
    logger.error("Error getting user info", { error, requestId: req.requestId });
    handleApiError(res, error);
  }
}

/**
 * Middleware to require an authenticated user (not anonymous)
 * Returns 401 if user is anonymous or not authenticated
 */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const userInfo = res.locals.userInfo;
  if (!userInfo || userInfo.is_anonymous) {
    const error = new AuthenticationError(
      "Authentication required to access this resource", 
      ErrorCode.AUTH_REQUIRED
    );
    logger.warn("Authentication required but user is anonymous or not authenticated", { 
      requestId: req.requestId, 
      path: req.path,
      method: req.method,
      isAnonymous: userInfo?.is_anonymous,
      hasUserInfo: !!userInfo
    });
    return handleApiError(res, error);
  }
  
  logger.debug("User authenticated successfully", { requestId: req.requestId, 
    userId: userInfo.user_id
  });
  next();
}

/**
 * Middleware to require an authenticated user or valid anonymous session
 * Returns 401 if no valid session exists
 */
export function requireSession(req: Request, res: Response, next: NextFunction) {
  // First, ensure we have user info from previous middleware
  if (!res.locals.userInfo) {
    // If getUserInfo middleware hasn't run yet, run it now
    try {
      logger.debug("User info not found, extracting from request", { requestId: req.requestId, 
        path: req.path,
        method: req.method
      });
      
      const userInfoPromise = getUserInfoFromRequest(req);
      
      // Handle the promise synchronously to maintain middleware flow
      userInfoPromise.then(userInfo => {
        res.locals.userInfo = userInfo;
        logger.debug("Successfully extracted user info", { requestId: req.requestId,  userInfo });
        
        // Now check if session is valid
        if (userInfo.is_anonymous && !userInfo.anonymous_session_id) {
          const error = new SessionError(
            "Valid session required", 
            ErrorCode.SESSION_REQUIRED,
            "Anonymous users must have a valid session ID"
          );
          
          logger.warn("Anonymous user missing valid session ID", { requestId: req.requestId, 
            path: req.path,
            method: req.method
          });
          
          return handleApiError(res, error);
        }
        
        logger.info("Session validated successfully", { requestId: req.requestId, 
          userType: userInfo.is_anonymous ? 'anonymous' : 'authenticated',
          userId: userInfo.user_id,
          sessionId: userInfo.anonymous_session_id
        });
        
        next();
      }).catch(error => {
        logger.error("Error extracting user info", { requestId: req.requestId,  error });
        
        const sessionError = new SessionError(
          "Valid session required", 
          ErrorCode.SESSION_REQUIRED,
          "Failed to extract user information"
        );
        
        return handleApiError(res, sessionError);
      });
      
      return; // Don't call next() here as it will be called by the promise
    } catch (error) {
      logger.error("Synchronous error in requireSession", { requestId: req.requestId,  error });
      
      const sessionError = new SessionError(
        "Valid session required", 
        ErrorCode.SESSION_REQUIRED,
        "Unexpected error processing session"
      );
      
      return handleApiError(res, sessionError);
    }
  } else {
    // We already have user info from previous middleware
    const userInfo = res.locals.userInfo;
    
    // For anonymous users, we need a valid session ID
    if (userInfo.is_anonymous && !userInfo.anonymous_session_id) {
      logger.warn("Anonymous user without valid session ID", { requestId: req.requestId, 
        path: req.path,
        method: req.method
      });
      
      const error = new SessionError(
        "Valid session required", 
        ErrorCode.SESSION_REQUIRED,
        "Anonymous users must have a valid session ID"
      );
      
      return handleApiError(res, error);
    }
    
    // Session is valid, proceed
    logger.debug("Using existing session", { requestId: req.requestId, 
      userType: userInfo.is_anonymous ? 'anonymous' : 'authenticated',
      userId: userInfo.user_id
    });
    
    next();
  }
}

/**
 * Gets detailed user information from request headers
 * Handles both authenticated users and anonymous sessions
 * 
 * @param req Express request object
 * @returns User information including ID, session details, and authentication status
 */
export async function getUserInfoFromRequest(req: Request): Promise<{ 
  user_id: number; 
  anonymous_session_id?: string;
  is_anonymous: boolean;
}> {
  logger.debug("Extracting user info from request headers", { requestId: req.requestId });
  
  // 1. Try to get the user ID from the x-user-id header (for authenticated users)
  // Default to 7 for anonymous users (our dedicated anonymous user ID)
  let userId: number = 7; // Default to our anonymous user ID
  let isAnonymous = true;
  let anonymousSessionId: string | undefined = undefined;
  
  // Check if we have a user ID header
  if (req.headers['x-user-id']) {
    try {
      const headerValue = req.headers['x-user-id'];
      logger.debug("Found x-user-id header", { requestId: req.requestId,  headerValue });
      
      // Handle both string and array formats
      const idValue = Array.isArray(headerValue) ? headerValue[0] : headerValue;
      
      // Try to extract a numeric value - be strict about this being a number
      // First convert to string in case it's something else
      const stringValue = String(idValue);
      
      // Use regex to extract just the numeric portion if mixed with other characters
      const matches = stringValue.match(/(\d+)/);
      const cleanValue = matches ? matches[1] : stringValue;
      
      const parsedId = parseInt(cleanValue, 10);
      
      // Validate the parsed ID - specifically don't treat 1 as authenticated
      // since that's our old anonymous user ID
      if (!isNaN(parsedId) && parsedId > 0 && parsedId !== 1) {
        userId = parsedId;
        isAnonymous = false;
        logger.info("Successfully parsed authenticated user ID", { requestId: req.requestId,  userId });
      } else if (!isNaN(parsedId) && parsedId === 1) {
        // This is an anonymous user, so check for a session header
        logger.debug("Found user ID 1 (old anonymous), using new anonymous user ID 7", { requestId: req.requestId });
        userId = 7; // Use our dedicated anonymous user
      } else {
        logger.warn("Invalid user ID format in header", { requestId: req.requestId,  
          headerValue: idValue, 
          parsedId
        });
      }
    } catch (error) {
      logger.error("Error parsing user ID from header", { requestId: req.requestId,  error });
    }
  } else {
    logger.debug("No x-user-id header found, using anonymous user ID 7", { requestId: req.requestId });
  }
  
  // 2. If this is an anonymous user, look for session tracking
  if (isAnonymous) {
    // Check for anonymous session header
    const sessionHeader = req.headers['x-anonymous-session'];
    if (sessionHeader) {
      const sessionId = Array.isArray(sessionHeader) ? sessionHeader[0] : sessionHeader as string;
      logger.debug("Found anonymous session header", { requestId: req.requestId,  sessionId });
      
      // Check if this session exists in the database
      let session = await dbStorage.getAnonymousSessionBySessionId(sessionId);
      
      if (!session) {
        // Create a new session if it doesn't exist
        logger.info("Creating new anonymous session in database", { requestId: req.requestId,  sessionId });
        try {
          session = await dbStorage.createAnonymousSession({
            session_id: sessionId,
            user_agent: req.headers['user-agent'] || null,
            ip_address: req.ip || null
          });
          logger.info("Session created successfully", { requestId: req.requestId,  sessionId });
        } catch (error) {
          logger.error("Error creating anonymous session", { requestId: req.requestId,  
            sessionId,
            error
          });
        }
      } else {
        logger.debug("Using existing anonymous session from database", { requestId: req.requestId,  sessionId });
      }
      
      // Update the session's last active timestamp
      await dbStorage.updateAnonymousSessionLastActive(sessionId);
      
      // Set the anonymous session ID for return
      anonymousSessionId = sessionId;
    } else {
      logger.debug("No anonymous session header found, using default anonymous user ID 7", { requestId: req.requestId });
    }
  }
  
  logger.debug("Final user info", { requestId: req.requestId,  
    user_id: userId, 
    is_anonymous: isAnonymous, 
    has_session: !!anonymousSessionId 
  });
  
  return {
    user_id: userId,
    anonymous_session_id: anonymousSessionId,
    is_anonymous: isAnonymous
  };
}

/**
 * Returns the user ID for authenticated users or the anonymous user ID (7) for anonymous users
 * This supports the session-based approach for both user types
 * 
 * @param req Express request object
 * @returns The user ID for authenticated users or anonymous user ID (7) for anonymous users
 */
export async function getUserIdFromRequest(req: Request): Promise<number> {
  logger.debug("Extracting user ID from request headers", { requestId: req.requestId });
  
  // Default to the anonymous user ID (7) for anonymous users
  let userId: number = 7; // Using our dedicated anonymous user ID
  let isAnonymous = true;
  let anonymousSessionId: string | null = null;
  
  // Check if we have a user ID header first (authenticated user)
  if (req.headers['x-user-id']) {
    try {
      const headerValue = req.headers['x-user-id'];
      logger.debug("Found x-user-id header", { requestId: req.requestId,  headerValue });
      
      // Handle both string and array formats
      const idValue = Array.isArray(headerValue) ? headerValue[0] : headerValue;
      
      // Try to extract a numeric value - be strict about this being a number
      // First convert to string in case it's something else
      const stringValue = String(idValue);
      
      // Use regex to extract just the numeric portion if mixed with other characters
      const matches = stringValue.match(/(\d+)/);
      const cleanValue = matches ? matches[1] : stringValue;
      
      const parsedId = parseInt(cleanValue, 10);
      
      // Validate the parsed ID - if it's valid and not 1 (old anonymous ID), use it
      if (!isNaN(parsedId) && parsedId > 0 && parsedId !== 1) {
        userId = parsedId;
        isAnonymous = false; // This is an authenticated user
        logger.info("Successfully parsed authenticated user ID", { requestId: req.requestId,  userId });
      } else if (!isNaN(parsedId) && parsedId === 1) {
        // This is the old anonymous user ID, use the new one (7)
        logger.debug("Found old anonymous user ID 1, using dedicated anonymous user ID 7", { requestId: req.requestId });
        userId = 7;
      } else {
        logger.warn("Invalid user ID format in header", { requestId: req.requestId,  
          headerValue: idValue,
          parsedId
        });
      }
    } catch (error) {
      logger.error("Error parsing user ID from header", { requestId: req.requestId,  error });
    }
  } else {
    logger.debug("No x-user-id header found, checking for anonymous session", { requestId: req.requestId });
  }
  
  // If this is an anonymous user, try to get their session
  if (isAnonymous) {
    const sessionHeader = req.headers['x-anonymous-session'];
    if (sessionHeader) {
      try {
        const sessionId = Array.isArray(sessionHeader) ? sessionHeader[0] : sessionHeader as string;
        logger.debug("Found anonymous session header", { requestId: req.requestId,  sessionId });
        anonymousSessionId = sessionId;
        
        // Get or create session and update last active time
        let session = await dbStorage.getAnonymousSessionBySessionId(sessionId);
        
        if (session) {
          logger.debug("Found existing anonymous session, updating last active time", { requestId: req.requestId,  sessionId });
          await dbStorage.updateAnonymousSessionLastActive(sessionId);
        } else {
          logger.info("Creating new anonymous session", { requestId: req.requestId,  sessionId });
          session = await dbStorage.createAnonymousSession({
            session_id: sessionId,
            user_agent: req.headers['user-agent'] || null,
            ip_address: req.ip || null
          });
        }
        
        // For anonymous users, we use the dedicated anonymous user ID (7)
        // The session ID header is what ties videos to specific anonymous users
        logger.debug("Using anonymous session ID with user ID 7", { requestId: req.requestId,  sessionId });
      } catch (error) {
        logger.error("Error handling anonymous session", { requestId: req.requestId,  
          sessionId: anonymousSessionId,
          error
        });
      }
    } else {
      logger.debug("No anonymous session header found, using anonymous user ID 7", { requestId: req.requestId });
    }
  }
  
  logger.debug("Final user ID being used", { requestId: req.requestId,  
    userId,
    type: typeof userId
  });
  return userId;
}