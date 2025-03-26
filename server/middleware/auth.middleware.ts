import { Request, Response, NextFunction } from 'express';
import { dbStorage } from '../database-storage';
import { ZodError } from 'zod';

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
    next(error);
  }
}

/**
 * Middleware to require an authenticated user (not anonymous)
 * Returns 401 if user is anonymous or not authenticated
 */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const userInfo = res.locals.userInfo;
  if (!userInfo || userInfo.is_anonymous) {
    return res.status(401).json({ 
      message: "Authentication required",
      code: "AUTH_REQUIRED" 
    });
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
          return res.status(401).json({ 
            message: "Valid session required",
            code: "SESSION_REQUIRED" 
          });
        }
        next();
      }).catch(error => {
        console.error("[Auth Middleware] Error extracting user info:", error);
        return res.status(401).json({ 
          message: "Valid session required",
          code: "SESSION_REQUIRED" 
        });
      });
      
      return; // Don't call next() here as it will be called by the promise
    } catch (error) {
      console.error("[Auth Middleware] Synchronous error in requireSession:", error);
      return res.status(401).json({ 
        message: "Valid session required",
        code: "SESSION_REQUIRED" 
      });
    }
  } else {
    // We already have user info from previous middleware
    const userInfo = res.locals.userInfo;
    
    // For anonymous users, we need a valid session ID
    if (userInfo.is_anonymous && !userInfo.anonymous_session_id) {
      console.log("[Auth Middleware] Anonymous user without valid session ID");
      return res.status(401).json({ 
        message: "Valid session required",
        code: "SESSION_REQUIRED" 
      });
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
  user_id: number | null; 
  anonymous_session_id?: string;
  is_anonymous: boolean;
}> {
  console.log("[Auth Helper] Extracting user info from request headers");
  
  // 1. Try to get the user ID from the x-user-id header (for authenticated users)
  // Default to null for anonymous users (not 1)
  let userId: number | null = null;
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
      // since that's our anonymous user ID
      if (!isNaN(parsedId) && parsedId > 0 && parsedId !== 1) {
        userId = parsedId;
        isAnonymous = false;
        console.log("[Auth Helper] Successfully parsed authenticated user ID:", userId);
      } else if (!isNaN(parsedId) && parsedId === 1) {
        // This is an anonymous user, so check for a session header
        console.log("[Auth Helper] Found user ID 1 (anonymous), checking for session");
      } else {
        console.warn("[Auth Helper] Invalid user ID format in header:", idValue, "- Parsed as:", parsedId);
      }
    } catch (error) {
      console.error("[Auth Helper] Error parsing user ID from header:", error)
    }
  } else {
    console.log("[Auth Helper] No x-user-id header found, checking for anonymous session");
  }
  
  // 2. If this is an anonymous user (userId is null), look for session tracking
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
      console.log("[Auth Helper] No anonymous session header found, using default anonymous user");
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
 * Returns the user ID for authenticated users or null for anonymous users
 * This supports the session-based approach for both user types
 * 
 * @param req Express request object
 * @returns The user ID for authenticated users or null for anonymous users
 */
export async function getUserIdFromRequest(req: Request): Promise<number | null> {
  console.log("[Auth Helper] Extracting user ID from request headers");
  
  // Default to null for anonymous users - this is the key change
  let userId: number | null = null;
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
      
      // Validate the parsed ID - exclude 1 since that's reserved for anonymous users
      if (!isNaN(parsedId) && parsedId > 0) {
        userId = parsedId;
        isAnonymous = false; // This is an authenticated user
        console.log("[Auth Helper] Successfully parsed authenticated user ID:", userId);
      } else {
        console.warn("[Auth Helper] Invalid user ID format in header:", idValue, "- Parsed as:", parsedId);
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
        
        // For anonymous users, we now return null instead of user_id=1
        // The session ID header is what ties videos to specific anonymous users
        console.log("[Auth Helper] Using anonymous session ID:", sessionId);
      } catch (error) {
        console.error("[Auth Helper] Error handling anonymous session:", error);
      }
    } else {
      console.log("[Auth Helper] No anonymous session header found, using null user ID for anonymous");
    }
  }
  
  console.log("[Auth Helper] Final user ID being used:", userId, "(type:", typeof userId, ")");
  return userId;
}