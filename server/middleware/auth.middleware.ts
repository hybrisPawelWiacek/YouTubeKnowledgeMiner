/**
 * Authentication Middleware
 * 
 * This middleware handles authentication for the application, supporting both 
 * registered and anonymous users. It provides route protection and user context 
 * for the request handlers.
 */

import { Request, Response, NextFunction } from 'express';
import { validateSession, extractSessionId, getUserById } from '../services/auth.service';
import { db } from '../db';
import { anonymous_sessions } from '../../shared/schema';
import { eq } from 'drizzle-orm';
import winston from 'winston';
import { dbStorage } from '../database-storage';
import { SYSTEM } from '../../shared/config';
import { isPromiseLike } from '../../shared/promise-utils';

// Configure logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  defaultMeta: { service: 'auth-middleware' },
  transports: [
    new winston.transports.File({ filename: 'logs/auth-middleware.log' }),
  ],
});

// If we're in development, also log to the console
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.simple(),
  }));
}

// Extend Express Request to include authenticated user
declare global {
  namespace Express {
    interface Request {
      user?: any;
      isAuthenticated: boolean;
      isAnonymous: boolean;
      sessionId?: string;
    }
  }
}

/**
 * Authentication middleware that validates the session and attaches user to request
 * 
 * This middleware handles three cases:
 * 1. Registered user with valid session
 * 2. Anonymous user with valid session
 * 3. No valid session (treated as new anonymous user)
 */
export async function authMiddleware(req: Request, res: Response, next: NextFunction) {
  try {
    // Initialize auth properties
    req.isAuthenticated = false;
    req.isAnonymous = true;
    
    // First check for anonymous session in header
    let anonymousSessionFromHeader = null;
    
    // Check for anonymous session in header 'x-anonymous-session'
    if (req.headers['x-anonymous-session']) {
      const headerSessionId = req.headers['x-anonymous-session'];
      const sessionIdValue = Array.isArray(headerSessionId) ? headerSessionId[0] : headerSessionId;
      
      // Check if valid anonymous session format
      if (typeof sessionIdValue === 'string' && sessionIdValue.startsWith(SYSTEM.ANONYMOUS_SESSION_PREFIX)) {
        logger.debug(`Found anonymous session in header: ${sessionIdValue}`);
        anonymousSessionFromHeader = sessionIdValue;
      }
    }
    
    // Extract session ID from cookie
    const sessionId = extractSessionId(req);
    
    // Set session ID - prefer cookie-based session, but use header session if no cookie
    const activeSessionId = sessionId || anonymousSessionFromHeader;
    
    if (activeSessionId) {
      req.sessionId = activeSessionId;
      
      // Check if it's a registered user session
      // Accept either non-anonymous-prefix sessions OR our custom auth_token format
      if (!activeSessionId.startsWith(SYSTEM.ANONYMOUS_SESSION_PREFIX) || activeSessionId.startsWith('auth_token_')) {
        logger.debug(`Validating standard or custom auth token: ${activeSessionId}`);
        const userId = await validateSession(activeSessionId);
        
        if (userId) {
          logger.debug(`Token validated successfully for user ID: ${userId}`);
          const user = await getUserById(userId);
          
          if (user) {
            req.user = user;
            req.isAuthenticated = true;
            req.isAnonymous = false;
            
            logger.debug(`Authenticated user: ${user.username} (ID: ${user.id})`);
          } else {
            logger.warn(`User ID ${userId} from token validation not found in database`);
          }
        } else {
          logger.warn(`Token validation failed for: ${activeSessionId}`);
        }
      } 
      // Handle anonymous session (format: anon_[timestamp]_[random])
      else {
        logger.debug(`Processing anonymous session: ${activeSessionId}`);
        
        // Check if session exists in the database
        const anonSession = await db
          .select()
          .from(anonymous_sessions)
          .where(eq(anonymous_sessions.session_id, activeSessionId));
        
        if (anonSession.length > 0) {
          // Session exists in the database, use it
          req.user = { 
            id: SYSTEM.ANONYMOUS_USER_ID, // Dedicated anonymous user ID from config
            username: 'anonymous',
            user_type: 'anonymous', // Explicitly set user type for anonymous users
            anonymous_session_id: activeSessionId
          };
          
          logger.debug(`Anonymous session validated: ${activeSessionId}`);
          
          // Update the session's last active timestamp
          try {
            await dbStorage.updateAnonymousSessionLastActive(activeSessionId);
            logger.debug(`Updated last active timestamp for session: ${activeSessionId}`);
          } catch (err) {
            logger.error(`Failed to update last active timestamp for session: ${activeSessionId}`, err);
          }
        } 
        // Session doesn't exist in the database yet, create it
        else {
          try {
            logger.info(`Creating new anonymous session: ${activeSessionId}`);
            
            // Create the anonymous session in the database
            const newSession = await dbStorage.createAnonymousSession({
              session_id: activeSessionId,
              user_agent: req.headers['user-agent'] || null,
              ip_address: req.ip || null
            });
            
            // Set up the user object with the anonymous user ID
            req.user = { 
              id: SYSTEM.ANONYMOUS_USER_ID, // Dedicated anonymous user ID from config
              username: 'anonymous',
              user_type: 'anonymous',
              anonymous_session_id: activeSessionId
            };
            
            logger.debug(`Created and validated new anonymous session: ${activeSessionId}`);
          } catch (error) {
            logger.error(`Failed to create anonymous session: ${activeSessionId}`, error);
          }
        }
      }
    }
    
    next();
  } catch (error) {
    logger.error('Auth middleware error:', error);
    next(error);
  }
}

/**
 * Middleware that ensures the user is authenticated
 * Use this to protect routes that require authentication
 */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (req.isAuthenticated) {
    return next();
  }
  
  return res.status(401).json({ error: 'Authentication required' });
}

/**
 * Middleware that allows only anonymous users
 * Used for routes that should only be accessible to anonymous users
 */
export function requireAnonymous(req: Request, res: Response, next: NextFunction) {
  if (req.isAnonymous) {
    return next();
  }
  
  return res.status(403).json({ error: 'This route is only for anonymous users' });
}

/**
 * Middleware that requires the user to have specific roles
 * @param roles - The roles required to access the route
 */
export function requireRoles(roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.isAuthenticated) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    // Check if user has any of the required roles
    const userRoles = req.user.roles || [];
    const hasRequiredRole = roles.some(role => userRoles.includes(role));
    
    if (!hasRequiredRole) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    
    next();
  };
}

/**
 * Middleware that ensures a user is either authenticated or has an anonymous session
 * This allows access to routes that require some form of user context
 */
export async function requireAnyUser(req: Request, res: Response, next: NextFunction) {
  try {
    // Enhanced logging for debugging
    logger.debug(`[requireAnyUser] Starting middleware check with isAuthenticated=${req.isAuthenticated}, isAnonymous=${req.isAnonymous}`);
    logger.debug(`[requireAnyUser] Headers: ${JSON.stringify(req.headers)}`);
    
    // Allow authenticated users
    if (req.isAuthenticated) {
      logger.debug(`[requireAnyUser] User is authenticated, proceeding`);
      return next();
    }
    
    // First check for auth token in authorization header (Bearer token)
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7); // Remove 'Bearer ' prefix
      
      // Check if it's our custom auth token
      if (token.startsWith('auth_token_')) {
        logger.debug(`[requireAnyUser] Found custom auth token in Authorization header`);
        
        // Validate the token
        try {
          const userId = await validateSession(token);
          if (userId) {
            logger.debug(`[requireAnyUser] Custom auth token validated for user ID: ${userId}`);
            const user = await getUserById(userId);
            
            if (user) {
              req.user = user;
              req.isAuthenticated = true;
              req.isAnonymous = false;
              req.sessionId = token;
              
              logger.debug(`[requireAnyUser] User authenticated via auth token: ${user.username}`);
              return next();
            }
          }
        } catch (error) {
          logger.error(`[requireAnyUser] Error validating custom auth token:`, error);
        }
      }
    }
    
    // Check for anonymous session in all possible locations
    // 1. In req.sessionId (from auth middleware)
    // 2. In x-anonymous-session header
    // 3. In req.user.anonymous_session_id
    
    let anonymousSessionId: string | null = null;
    
    // First check if already in req.sessionId from auth middleware
    if (req.sessionId) {
      if (req.sessionId.startsWith(SYSTEM.ANONYMOUS_SESSION_PREFIX)) {
        logger.debug(`[requireAnyUser] Found anonymous session ID in req.sessionId: ${req.sessionId}`);
        anonymousSessionId = req.sessionId;
      } else if (req.sessionId.startsWith('auth_token_')) {
        // Try to validate auth token format again
        const userId = await validateSession(req.sessionId);
        if (userId) {
          const user = await getUserById(userId);
          if (user) {
            req.user = user;
            req.isAuthenticated = true;
            req.isAnonymous = false;
            logger.debug(`[requireAnyUser] User authenticated via req.sessionId token: ${user.username}`);
            return next();
          }
        }
      }
    }
    
    // If not found, check the header
    if (!anonymousSessionId) {
      const headerSessionId = req.headers['x-anonymous-session'];
      
      if (headerSessionId) {
        // Handle both string and array cases
        const rawSessionId = Array.isArray(headerSessionId) ? headerSessionId[0] : headerSessionId;
        
        // Check if it's a promise or a string
        if (isPromiseLike(rawSessionId)) {
          logger.debug(`[requireAnyUser] Found Promise-like session ID in header`);
          try {
            // Resolve the promise
            const resolvedSessionId = await (rawSessionId as unknown as Promise<string>);
            if (resolvedSessionId && resolvedSessionId.startsWith(SYSTEM.ANONYMOUS_SESSION_PREFIX)) {
              logger.debug(`[requireAnyUser] Resolved session ID: ${resolvedSessionId}`);
              anonymousSessionId = resolvedSessionId;
            }
          } catch (err) {
            logger.error(`[requireAnyUser] Failed to resolve Promise session ID:`, err);
          }
        } else if (typeof rawSessionId === 'string' && rawSessionId.startsWith(SYSTEM.ANONYMOUS_SESSION_PREFIX)) {
          logger.debug(`[requireAnyUser] Found string session ID in header: ${rawSessionId}`);
          anonymousSessionId = rawSessionId;
        }
      }
    }
    
    // If not found in sessionId or header, check if it's in the user object
    if (!anonymousSessionId && req.user?.anonymous_session_id) {
      logger.debug(`[requireAnyUser] Found session ID in user object: ${req.user.anonymous_session_id}`);
      anonymousSessionId = req.user.anonymous_session_id;
    }
    
    // If we have an anonymous session ID from any source, verify it exists in the database
    if (anonymousSessionId) {
      logger.debug(`[requireAnyUser] Verifying anonymous session: ${anonymousSessionId}`);
      
      // Check if session exists in the database
      const session = await db
        .select()
        .from(anonymous_sessions)
        .where(eq(anonymous_sessions.session_id, anonymousSessionId));
      
      if (session.length > 0) {
        logger.debug(`[requireAnyUser] Anonymous session verified in database`);
        
        // Set up the user object correctly if not already set
        if (!req.user) {
          req.user = {
            id: SYSTEM.ANONYMOUS_USER_ID,
            username: 'anonymous',
            user_type: 'anonymous',
            anonymous_session_id: anonymousSessionId
          };
        } else if (!req.user.anonymous_session_id) {
          // Make sure the session ID is in the user object
          req.user.anonymous_session_id = anonymousSessionId;
        }
        
        // Set req.isAnonymous explicitly to true
        req.isAnonymous = true;
        
        // Make sure the sessionId is set on the request
        req.sessionId = anonymousSessionId;
        
        logger.debug(`[requireAnyUser] Anonymous user setup complete, proceeding`);
        return next();
      } else {
        // Session ID is valid format but not in database, create it
        logger.debug(`[requireAnyUser] Session not found in database, creating new session`);
        try {
          const newSession = await dbStorage.createAnonymousSession({
            session_id: anonymousSessionId,
            user_agent: req.headers['user-agent'] || null,
            ip_address: req.ip || null
          });
          
          // Set up the user object correctly
          req.user = {
            id: SYSTEM.ANONYMOUS_USER_ID,
            username: 'anonymous',
            user_type: 'anonymous',
            anonymous_session_id: anonymousSessionId
          };
          
          // Set req.isAnonymous explicitly to true
          req.isAnonymous = true;
          
          // Make sure the sessionId is set on the request
          req.sessionId = anonymousSessionId;
          
          logger.debug(`[requireAnyUser] New anonymous session created, proceeding`);
          return next();
        } catch (error) {
          logger.error(`[requireAnyUser] Error creating new anonymous session:`, error);
          // Fall through to authentication required
        }
      }
    }
    
    // No authenticated user and no valid anonymous session
    logger.debug(`[requireAnyUser] No valid authenticated user or anonymous session found`);
    return res.status(401).json({ error: 'Authentication required' });
  } catch (error) {
    logger.error(`[requireAnyUser] Unexpected error in middleware:`, error);
    return res.status(500).json({ error: 'Internal server error in authentication middleware' });
  }
}