import { Request, Response, NextFunction } from 'express';
import { storage } from '../storage';
import { authService } from '../services/auth.service';
import { AuthenticationError, SessionError, ErrorCode } from '../utils/error.utils';
import { handleApiError } from '../utils/response.utils';
import { createLogger } from '../services/logger';

// Extend Express Request type to include user property
declare global {
  namespace Express {
    interface Request {
      user?: any;
      isAuthenticated?: boolean;
      anonymousSessionId?: string;
    }
  }
}

const logger = createLogger('auth');

/**
 * Authentication middleware that handles both registered users and anonymous sessions
 * 
 * This middleware:
 * 1. Checks for a valid session token and attaches the user to the request if found
 * 2. Tracks anonymous sessions when no authenticated user is present
 * 3. Updates last active timestamps for both types of sessions
 * 4. Maintains compatibility with existing anonymous flow
 */
export async function getUserInfo(req: Request, res: Response, next: NextFunction) {
  try {
    logger.debug('Processing authentication');
    
    // First check for authenticated user session via cookie
    const sessionToken = req.cookies.sessionToken;
    
    if (sessionToken) {
      logger.debug('Found session token cookie');
      const user = await authService.getUserBySessionToken(sessionToken);
      
      if (user) {
        // User is authenticated - attach to request and res.locals
        req.user = user;
        req.isAuthenticated = true;
        
        // Set compatible userInfo for existing code
        res.locals.userInfo = {
          user_id: user.id,
          is_anonymous: false
        };
        
        logger.debug(`User authenticated via cookie: ${user.id} (${user.username})`);
        return next();
      } else {
        // Invalid or expired session token, clear it
        res.clearCookie('sessionToken');
        logger.debug('Invalid session token cleared');
      }
    }
    
    // If no authenticated user via cookie, check headers (backward compatibility)
    // Legacy header auth method
    const legacyUserInfo = await getUserInfoFromRequest(req);
    if (!legacyUserInfo.is_anonymous) {
      // Legacy authenticated user via header
      req.isAuthenticated = true;
      
      // Get the actual user from the database
      const user = await storage.getUser(legacyUserInfo.user_id);
      if (user) {
        req.user = user;
      }
    }
    
    // Store the legacy userInfo for backward compatibility
    res.locals.userInfo = legacyUserInfo;
    
    // If using anonymous flow, track the session
    if (legacyUserInfo.is_anonymous && legacyUserInfo.anonymous_session_id) {
      req.anonymousSessionId = legacyUserInfo.anonymous_session_id;
    }
    
    // Also check for anonymousSessionId cookie (for migration path)
    const anonymousSessionId = req.cookies.anonymousSessionId;
    if (anonymousSessionId && !req.anonymousSessionId) {
      req.anonymousSessionId = anonymousSessionId;
      
      // Update last active time for anonymous session
      try {
        await storage.updateAnonymousSessionLastActive(anonymousSessionId);
        
        // Add to legacy userInfo if not already there
        if (!res.locals.userInfo.anonymous_session_id) {
          res.locals.userInfo.anonymous_session_id = anonymousSessionId;
        }
        
        logger.debug(`Anonymous session active from cookie: ${anonymousSessionId}`);
      } catch (err) {
        logger.warn(`Failed to update anonymous session: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    
    next();
  } catch (error) {
    logger.error(`Auth middleware error: ${error instanceof Error ? error.message : String(error)}`);
    handleApiError(res, error);
  }
}

/**
 * Middleware to require an authenticated user (not anonymous)
 * Returns 401 if user is anonymous or not authenticated
 */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.user || !req.isAuthenticated) {
    const error = new AuthenticationError(
      "Authentication required to access this resource", 
      ErrorCode.AUTH_REQUIRED
    );
    return handleApiError(res, error);
  }
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
      console.log("[Auth Middleware] User info not found, extracting from request");
      const userInfoPromise = getUserInfoFromRequest(req);
      
      // Handle the promise synchronously to maintain middleware flow
      userInfoPromise.then(userInfo => {
        res.locals.userInfo = userInfo;
        console.log("[Auth Middleware] Successfully extracted user info:", userInfo);
        
        // Now check if session is valid
        if (userInfo.is_anonymous && !userInfo.anonymous_session_id) {
          const error = new SessionError(
            "Valid session required", 
            ErrorCode.SESSION_REQUIRED,
            { reason: "Anonymous users must have a valid session ID" }
          );
          return handleApiError(res, error);
        }
        next();
      }).catch(error => {
        console.error("[Auth Middleware] Error extracting user info:", error);
        const sessionError = new SessionError(
          "Valid session required", 
          ErrorCode.SESSION_REQUIRED,
          { reason: "Failed to extract user information" }
        );
        return handleApiError(res, sessionError);
      });
      
      return; // Don't call next() here as it will be called by the promise
    } catch (error) {
      console.error("[Auth Middleware] Synchronous error in requireSession:", error);
      const sessionError = new SessionError(
        "Valid session required", 
        ErrorCode.SESSION_REQUIRED,
        { reason: "Unexpected error processing session" }
      );
      return handleApiError(res, sessionError);
    }
  } else {
    // We already have user info from previous middleware
    const userInfo = res.locals.userInfo;
    
    // For anonymous users, we need a valid session ID
    if (userInfo.is_anonymous && !userInfo.anonymous_session_id) {
      console.log("[Auth Middleware] Anonymous user without valid session ID");
      const error = new SessionError(
        "Valid session required", 
        ErrorCode.SESSION_REQUIRED,
        { reason: "Anonymous users must have a valid session ID" }
      );
      return handleApiError(res, error);
    }
    
    // Session is valid, proceed
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
  console.log("[Auth Helper] Extracting user info from request headers");
  
  // 1. Try to get the user ID from the x-user-id header (for authenticated users)
  // Default to 7 for anonymous users (our dedicated anonymous user ID)
  let userId: number = 7; // Default to our anonymous user ID
  let isAnonymous = true;
  let anonymousSessionId: string | undefined = undefined;
  
  // Check if we have a user ID header
  if (req.headers['x-user-id']) {
    try {
      const headerValue = req.headers['x-user-id'];
      console.log("[Auth Helper] Found x-user-id header:", headerValue);
      
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
        console.log("[Auth Helper] Successfully parsed authenticated user ID:", userId);
      } else if (!isNaN(parsedId) && parsedId === 1) {
        // This is an anonymous user, so check for a session header
        console.log("[Auth Helper] Found user ID 1 (old anonymous), using new anonymous user ID 7");
        userId = 7; // Use our dedicated anonymous user
      } else {
        console.warn("[Auth Helper] Invalid user ID format in header:", idValue, "- Parsed as:", parsedId);
      }
    } catch (error) {
      console.error("[Auth Helper] Error parsing user ID from header:", error)
    }
  } else {
    console.log("[Auth Helper] No x-user-id header found, using anonymous user ID 7");
  }
  
  // 2. If this is an anonymous user, look for session tracking
  if (isAnonymous) {
    // Check for anonymous session header
    const sessionHeader = req.headers['x-anonymous-session'];
    if (sessionHeader) {
      const sessionId = Array.isArray(sessionHeader) ? sessionHeader[0] : sessionHeader as string;
      console.log("[Auth Helper] Found anonymous session header:", sessionId);
      
      // Check if this session exists in the database
      let session = await storage.getAnonymousSessionBySessionId(sessionId);
      
      if (!session) {
        // Create a new session if it doesn't exist
        console.log("[Auth Helper] Creating new anonymous session in database");
        try {
          session = await storage.createAnonymousSession({
            session_id: sessionId,
            user_agent: req.headers['user-agent'] || null,
            ip_address: req.ip || null
          });
          console.log("[Auth Helper] Session created successfully:", session);
        } catch (error) {
          console.error("[Auth Helper] ERROR creating anonymous session:", error);
        }
      } else {
        console.log("[Auth Helper] Using existing anonymous session from database");
      }
      
      // Update the session's last active timestamp
      await storage.updateAnonymousSessionLastActive(sessionId);
      
      // Set the anonymous session ID for return
      anonymousSessionId = sessionId;
    } else {
      console.log("[Auth Helper] No anonymous session header found, using default anonymous user ID 7");
    }
  }
  
  console.log("[Auth Helper] Final user info:", { 
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
  console.log("[Auth Helper] Extracting user ID from request headers");
  
  // Default to the anonymous user ID (7) for anonymous users
  let userId: number = 7; // Using our dedicated anonymous user ID
  let isAnonymous = true;
  let anonymousSessionId: string | null = null;
  
  // Check if we have a user ID header first (authenticated user)
  if (req.headers['x-user-id']) {
    try {
      const headerValue = req.headers['x-user-id'];
      console.log("[Auth Helper] Found x-user-id header:", headerValue);
      
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
        console.log("[Auth Helper] Successfully parsed authenticated user ID:", userId);
      } else if (!isNaN(parsedId) && parsedId === 1) {
        // This is the old anonymous user ID, use the new one (7)
        console.log("[Auth Helper] Found old anonymous user ID 1, using dedicated anonymous user ID 7");
        userId = 7;
      } else {
        console.warn("[Auth Helper] Invalid user ID format in header:", idValue, "- Using anonymous user ID 7");
      }
    } catch (error) {
      console.error("[Auth Helper] Error parsing user ID from header:", error);
    }
  } else {
    console.log("[Auth Helper] No x-user-id header found, checking for anonymous session");
  }
  
  // If this is an anonymous user, try to get their session
  if (isAnonymous) {
    const sessionHeader = req.headers['x-anonymous-session'];
    if (sessionHeader) {
      try {
        const sessionId = Array.isArray(sessionHeader) ? sessionHeader[0] : sessionHeader as string;
        console.log("[Auth Helper] Found anonymous session header:", sessionId);
        anonymousSessionId = sessionId;
        
        // Get or create session and update last active time
        let session = await storage.getAnonymousSessionBySessionId(sessionId);
        
        if (session) {
          console.log("[Auth Helper] Found existing anonymous session, updating last active time");
          await storage.updateAnonymousSessionLastActive(sessionId);
        } else {
          console.log("[Auth Helper] Creating new anonymous session");
          session = await storage.createAnonymousSession({
            session_id: sessionId,
            user_agent: req.headers['user-agent'] || null,
            ip_address: req.ip || null
          });
        }
        
        // For anonymous users, we use the dedicated anonymous user ID (7)
        // The session ID header is what ties videos to specific anonymous users
        console.log("[Auth Helper] Using anonymous session ID:", sessionId, "with user ID 7");
      } catch (error) {
        console.error("[Auth Helper] Error handling anonymous session:", error);
      }
    } else {
      console.log("[Auth Helper] No anonymous session header found, using anonymous user ID 7");
    }
  }
  
  console.log("[Auth Helper] Final user ID being used:", userId, "(type:", typeof userId, ")");
  return userId;
}