import { Request, Response, NextFunction } from 'express';
import { dbStorage } from '../database-storage';
import { ZodError } from 'zod';
import { AuthenticationError, SessionError, ErrorCode } from '../utils/error.utils';
import { handleApiError } from '../utils/response.utils';

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
    console.error("[Auth Middleware] Error getting user info:", error);
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
            "Anonymous users must have a valid session ID"
          );
          return handleApiError(res, error);
        }
        next();
      }).catch(error => {
        console.error("[Auth Middleware] Error extracting user info:", error);
        const sessionError = new SessionError(
          "Valid session required", 
          ErrorCode.SESSION_REQUIRED,
          "Failed to extract user information"
        );
        return handleApiError(res, sessionError);
      });
      
      return; // Don't call next() here as it will be called by the promise
    } catch (error) {
      console.error("[Auth Middleware] Synchronous error in requireSession:", error);
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
      console.log("[Auth Middleware] Anonymous user without valid session ID");
      const error = new SessionError(
        "Valid session required", 
        ErrorCode.SESSION_REQUIRED,
        "Anonymous users must have a valid session ID"
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
      let session = await dbStorage.getAnonymousSessionBySessionId(sessionId);
      
      if (!session) {
        // Create a new session if it doesn't exist
        console.log("[Auth Helper] Creating new anonymous session in database");
        try {
          session = await dbStorage.createAnonymousSession({
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
      await dbStorage.updateAnonymousSessionLastActive(sessionId);
      
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
        let session = await dbStorage.getAnonymousSessionBySessionId(sessionId);
        
        if (session) {
          console.log("[Auth Helper] Found existing anonymous session, updating last active time");
          await dbStorage.updateAnonymousSessionLastActive(sessionId);
        } else {
          console.log("[Auth Helper] Creating new anonymous session");
          session = await dbStorage.createAnonymousSession({
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