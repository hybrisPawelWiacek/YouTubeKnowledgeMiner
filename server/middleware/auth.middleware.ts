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
    
    // Extract session ID from cookie
    const sessionId = extractSessionId(req);
    
    if (sessionId) {
      req.sessionId = sessionId;
      
      // Check if it's a registered user session (format: not starting with ANONYMOUS_SESSION_PREFIX)
      if (!sessionId.startsWith(SYSTEM.ANONYMOUS_SESSION_PREFIX)) {
        const userId = await validateSession(sessionId);
        
        if (userId) {
          const user = await getUserById(userId);
          
          if (user) {
            req.user = user;
            req.isAuthenticated = true;
            req.isAnonymous = false;
            
            logger.debug(`Authenticated user: ${user.username} (ID: ${user.id})`);
          }
        }
      } 
      // Handle anonymous session (format: anon_[timestamp]_[random])
      else {
        const anonSession = await db
          .select()
          .from(anonymous_sessions)
          .where(eq(anonymous_sessions.session_id, sessionId));
        
        if (anonSession.length > 0) {
          // Session exists in the database, use it
          req.user = { 
            id: SYSTEM.ANONYMOUS_USER_ID, // Dedicated anonymous user ID from config
            username: 'anonymous',
            user_type: 'anonymous', // Explicitly set user type for anonymous users
            anonymous_session_id: sessionId
          };
          
          logger.debug(`Anonymous session validated: ${sessionId}`);
          
          // Update the session's last active timestamp
          try {
            await dbStorage.updateAnonymousSessionLastActive(sessionId);
            logger.debug(`Updated last active timestamp for session: ${sessionId}`);
          } catch (err) {
            logger.error(`Failed to update last active timestamp for session: ${sessionId}`, err);
          }
        } 
        // Session doesn't exist in the database yet, create it
        else {
          try {
            logger.info(`Creating new anonymous session: ${sessionId}`);
            
            // Create the anonymous session in the database
            const newSession = await dbStorage.createAnonymousSession({
              session_id: sessionId,
              user_agent: req.headers['user-agent'] || null,
              ip_address: req.ip || null
            });
            
            // Set up the user object with the anonymous user ID
            req.user = { 
              id: SYSTEM.ANONYMOUS_USER_ID, // Dedicated anonymous user ID from config
              username: 'anonymous',
              user_type: 'anonymous',
              anonymous_session_id: sessionId
            };
            
            logger.debug(`Created and validated new anonymous session: ${sessionId}`);
          } catch (error) {
            logger.error(`Failed to create anonymous session: ${sessionId}`, error);
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
  // Allow authenticated users
  if (req.isAuthenticated) {
    return next();
  }
  
  // Also check for anonymous session in headers (not just in req.sessionId from auth middleware)
  const headerSessionId = req.headers['x-anonymous-session'];
  
  // Check if we have a header session and it starts with the anonymous prefix
  let hasHeaderSession = false;
  let sessionIdToUse: string | null = null;
  
  if (headerSessionId) {
    // Handle both string and array cases
    const rawSessionId = Array.isArray(headerSessionId) ? headerSessionId[0] : headerSessionId;
    
    // Use the shared isPromiseLike utility function
    
    if (isPromiseLike(rawSessionId)) {
      logger.info(`Found Promise-like session ID in requireAnyUser middleware`);
      // We need to handle this async, will do that in the next section
      hasHeaderSession = true; // Assume valid for now, will check after resolving
    } else {
      // It's a regular string
      sessionIdToUse = rawSessionId as string;
      hasHeaderSession = sessionIdToUse.startsWith(SYSTEM.ANONYMOUS_SESSION_PREFIX);
    }
  }
  
  // If the request has a valid anonymous session ID format
  if (req.isAnonymous && 
     (req.sessionId?.startsWith(SYSTEM.ANONYMOUS_SESSION_PREFIX) || hasHeaderSession)) {
    
    // If req.user is not set yet, but we have a valid anonymous session ID in headers,
    // let's set up the anonymous user now:
    if (!req.user && hasHeaderSession) {
      if (sessionIdToUse) {
        logger.info(`Setting up anonymous user from header session: ${sessionIdToUse}`);
        
        // We have a resolved session ID string
        req.user = { 
          id: SYSTEM.ANONYMOUS_USER_ID,
          username: 'anonymous',
          user_type: 'anonymous',
          anonymous_session_id: sessionIdToUse
        };
      } else {
        // We need to handle a Promise-like session ID
        const rawSessionId = Array.isArray(headerSessionId) ? headerSessionId[0] : headerSessionId;
        
        logger.info(`Using default anonymous user while Promise resolves`);
        // Set up a basic anonymous user for now
        req.user = { 
          id: SYSTEM.ANONYMOUS_USER_ID,
          username: 'anonymous',
          user_type: 'anonymous'
        };
        
        // Asynchronously resolve and update the session ID
        // This ensures the middleware doesn't block
        (async () => {
          try {
            // Cast and resolve the Promise
            const resolvedSessionId = await (rawSessionId as unknown as Promise<string>);
            if (resolvedSessionId && resolvedSessionId.startsWith(SYSTEM.ANONYMOUS_SESSION_PREFIX)) {
              // Update the request user object if still processing
              req.user.anonymous_session_id = resolvedSessionId;
            }
          } catch (err) {
            logger.error(`Failed to resolve Promise session ID in middleware:`, err);
          }
        })();
      }
    }
    
    return next();
  }
  
  logger.info(`Access denied by requireAnyUser: isAnonymous=${req.isAnonymous}, hasSessionId=${!!req.sessionId}, hasHeaderSession=${hasHeaderSession}, hasUser=${!!req.user}`);
  return res.status(401).json({ error: 'Valid user session required' });
}