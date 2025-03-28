/**
 * Session Management Service
 * 
 * This service handles all session-related functionality:
 * - Session creation, validation, and expiration for authenticated users
 * - Anonymous session tracking and management
 * - Session data storage and retrieval
 * - Session security and cleanup
 */

import crypto from 'crypto';
import { AnonymousSession, UserSession } from '@shared/schema';
import { storage } from '../storage';
import { createLogger } from './logger';
import { SessionError } from './auth.service';

const logger = createLogger('session');

// Session cleanup interval (24 hours)
const CLEANUP_INTERVAL = 24 * 60 * 60 * 1000;

// Anonymous session expiration (90 days)
const ANONYMOUS_SESSION_EXPIRY_DAYS = 90;

// Authenticated session expiration (14 days)
const USER_SESSION_EXPIRY_DAYS = 14;

/**
 * Start the session cleanup task
 * This runs periodically to clean up expired sessions
 */
function startSessionCleanup() {
  logger.info('Starting session cleanup task');
  
  // Run immediately once
  cleanupExpiredSessions();
  
  // Then schedule regular cleanup
  setInterval(cleanupExpiredSessions, CLEANUP_INTERVAL);
}

/**
 * Clean up expired sessions
 * This removes authenticated sessions that have expired and
 * anonymous sessions that haven't been active for over 90 days
 */
async function cleanupExpiredSessions() {
  try {
    logger.info('Running session cleanup task');
    
    // Calculate expiration cutoff dates
    const now = new Date();
    
    // Authenticated sessions - use their explicit expiry date
    const authSessionsDeleted = await storage.deleteExpiredUserSessions();
    
    // Anonymous sessions - use last active date
    const anonymousExpiryDate = new Date(now);
    anonymousExpiryDate.setDate(now.getDate() - ANONYMOUS_SESSION_EXPIRY_DAYS);
    
    const anonSessionsDeleted = await storage.deleteInactiveAnonymousSessions(anonymousExpiryDate);
    
    logger.info('Session cleanup completed', {
      authenticatedSessionsRemoved: authSessionsDeleted,
      anonymousSessionsRemoved: anonSessionsDeleted
    });
  } catch (error) {
    logger.error('Session cleanup task failed', {
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

/**
 * Generate a secure random session ID
 * @returns A cryptographically secure random session ID
 */
function generateSessionId(): string {
  // Use a prefix to make it easy to identify the type of token
  return `session_${crypto.randomBytes(32).toString('hex')}`;
}

/**
 * Generate a secure anonymous session ID
 * @returns A cryptographically secure random anonymous session ID
 */
function generateAnonymousSessionId(): string {
  // Use a prefix for easier identification in logs
  return `anon_${Date.now()}_${crypto.randomBytes(12).toString('hex')}`;
}

/**
 * Create a new user session
 * @param userId User ID to associate with the session
 * @param userAgent Optional browser/client identification
 * @param ipAddress Optional IP address of the client
 * @returns The created session object
 */
async function createUserSession(
  userId: number,
  userAgent?: string,
  ipAddress?: string
): Promise<UserSession> {
  try {
    // Generate session token
    const sessionToken = generateSessionId();
    
    // Set expiration date
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + USER_SESSION_EXPIRY_DAYS);
    
    // Create session in database
    const session = await storage.createUserSession({
      user_id: userId,
      session_token: sessionToken,
      expires_at: expiresAt,
      user_agent: userAgent || null,
      ip_address: ipAddress || null,
    });
    
    logger.info('Created user session', { userId, sessionId: session.id });
    
    return session;
  } catch (error) {
    logger.error('Failed to create user session', {
      error: error instanceof Error ? error.message : String(error),
      userId
    });
    throw new Error('Failed to create user session');
  }
}

/**
 * Get a user session by its token
 * @param token Session token to look up
 * @returns The session if found and valid, null otherwise
 */
async function getUserSession(token: string): Promise<UserSession | null> {
  try {
    const session = await storage.getUserSessionByToken(token);
    
    if (!session) {
      return null;
    }
    
    // Check if the session has expired
    if (new Date() > session.expires_at) {
      // Delete the expired session
      await storage.deleteUserSessionByToken(token);
      return null;
    }
    
    return session;
  } catch (error) {
    logger.error('Error retrieving user session', {
      error: error instanceof Error ? error.message : String(error),
      token: token.substring(0, 5) + '...' // Log just a fragment for security
    });
    return null;
  }
}

/**
 * Update a user session's last activity timestamp
 * @param sessionId ID of the session to update
 * @returns True if updated successfully, false otherwise
 */
async function updateUserSessionActivity(sessionId: number): Promise<boolean> {
  try {
    await storage.updateUserSessionLastActive(sessionId);
    return true;
  } catch (error) {
    logger.error('Failed to update user session activity', {
      error: error instanceof Error ? error.message : String(error),
      sessionId
    });
    return false;
  }
}

/**
 * Invalidate a user session (logout)
 * @param token Session token to invalidate
 * @returns True if invalidated successfully, false otherwise
 */
async function invalidateUserSession(token: string): Promise<boolean> {
  try {
    const result = await storage.deleteUserSessionByToken(token);
    return result > 0;
  } catch (error) {
    logger.error('Failed to invalidate user session', {
      error: error instanceof Error ? error.message : String(error),
      token: token.substring(0, 5) + '...' // Log just a fragment for security
    });
    return false;
  }
}

/**
 * Invalidate all sessions for a specific user
 * @param userId User ID whose sessions should be invalidated
 * @returns Number of sessions that were invalidated
 */
async function invalidateAllUserSessions(userId: number): Promise<number> {
  try {
    const count = await storage.deleteAllUserSessions(userId);
    logger.info('Invalidated all user sessions', { userId, count });
    return count;
  } catch (error) {
    logger.error('Failed to invalidate all user sessions', {
      error: error instanceof Error ? error.message : String(error),
      userId
    });
    return 0;
  }
}

/**
 * Create a new anonymous session
 * @param sessionId Optional client-provided session ID
 * @param userAgent Optional browser/client identification
 * @param ipAddress Optional IP address of the client
 * @returns The created anonymous session object
 */
async function createAnonymousSession(
  sessionId?: string,
  userAgent?: string,
  ipAddress?: string
): Promise<AnonymousSession> {
  try {
    // Generate a session ID if not provided
    const finalSessionId = sessionId || generateAnonymousSessionId();
    
    // Create the session in database
    const session = await storage.createAnonymousSession({
      session_id: finalSessionId,
      user_agent: userAgent || null,
      ip_address: ipAddress || null,
    });
    
    logger.info('Created anonymous session', { sessionId: finalSessionId });
    
    return session;
  } catch (error) {
    logger.error('Failed to create anonymous session', {
      error: error instanceof Error ? error.message : String(error),
      sessionId
    });
    throw new Error('Failed to create anonymous session');
  }
}

/**
 * Get an anonymous session by its ID
 * @param sessionId Anonymous session ID to look up
 * @returns The session if found, null otherwise
 */
async function getAnonymousSession(sessionId: string): Promise<AnonymousSession | null> {
  try {
    return await storage.getAnonymousSessionBySessionId(sessionId);
  } catch (error) {
    logger.error('Error retrieving anonymous session', {
      error: error instanceof Error ? error.message : String(error),
      sessionId
    });
    return null;
  }
}

/**
 * Update an anonymous session's last activity timestamp
 * @param sessionId ID of the anonymous session to update
 * @returns True if updated successfully, false otherwise
 */
async function updateAnonymousSessionActivity(sessionId: string): Promise<boolean> {
  try {
    await storage.updateAnonymousSessionLastActive(sessionId);
    return true;
  } catch (error) {
    logger.error('Failed to update anonymous session activity', {
      error: error instanceof Error ? error.message : String(error),
      sessionId
    });
    return false;
  }
}

/**
 * Get or create an anonymous session
 * @param sessionId Optional client-provided session ID
 * @param userAgent Optional browser/client identification
 * @param ipAddress Optional IP address of the client
 * @returns The anonymous session object (either existing or newly created)
 */
async function getOrCreateAnonymousSession(
  sessionId?: string,
  userAgent?: string,
  ipAddress?: string
): Promise<AnonymousSession> {
  try {
    // If a session ID was provided, try to find it
    if (sessionId) {
      const existingSession = await getAnonymousSession(sessionId);
      
      if (existingSession) {
        // Update last active time
        await updateAnonymousSessionActivity(sessionId);
        return existingSession;
      }
    }
    
    // Create a new session if not found or no ID provided
    return await createAnonymousSession(sessionId, userAgent, ipAddress);
  } catch (error) {
    logger.error('Failed to get or create anonymous session', {
      error: error instanceof Error ? error.message : String(error),
      sessionId
    });
    throw new Error('Failed to process anonymous session');
  }
}

/**
 * Increment the video count for an anonymous session
 * @param sessionId Anonymous session ID
 * @returns The updated video count
 */
async function incrementAnonymousVideoCount(sessionId: string): Promise<number> {
  try {
    const session = await getAnonymousSession(sessionId);
    
    if (!session) {
      throw new SessionError('Anonymous session not found');
    }
    
    const updatedCount = session.video_count + 1;
    
    await storage.updateAnonymousSession(sessionId, {
      video_count: updatedCount,
      last_active_at: new Date()
    });
    
    return updatedCount;
  } catch (error) {
    logger.error('Failed to increment anonymous video count', {
      error: error instanceof Error ? error.message : String(error),
      sessionId
    });
    throw error instanceof SessionError 
      ? error 
      : new Error('Failed to increment video count');
  }
}

/**
 * Get the current video count for an anonymous session
 * @param sessionId Anonymous session ID
 * @returns The current video count
 */
async function getAnonymousVideoCount(sessionId: string): Promise<number> {
  try {
    const session = await getAnonymousSession(sessionId);
    
    if (!session) {
      throw new SessionError('Anonymous session not found');
    }
    
    return session.video_count;
  } catch (error) {
    logger.error('Failed to get anonymous video count', {
      error: error instanceof Error ? error.message : String(error),
      sessionId
    });
    throw error instanceof SessionError 
      ? error 
      : new Error('Failed to get video count');
  }
}

/**
 * Check if an anonymous session has reached its video limit
 * @param sessionId Anonymous session ID
 * @param limit Maximum number of videos allowed (default: 3)
 * @returns True if limit reached, false otherwise
 */
async function hasReachedAnonymousLimit(
  sessionId: string,
  limit: number = 3
): Promise<boolean> {
  try {
    const count = await getAnonymousVideoCount(sessionId);
    return count >= limit;
  } catch (error) {
    logger.error('Failed to check anonymous limit', {
      error: error instanceof Error ? error.message : String(error),
      sessionId,
      limit
    });
    // Default to true (limit reached) on error to prevent abuse
    return true;
  }
}

/**
 * Migrate data from an anonymous session to a registered user
 * @param sessionId Anonymous session ID
 * @param userId User ID to migrate data to
 * @returns Number of items migrated
 */
async function migrateAnonymousData(
  sessionId: string,
  userId: number
): Promise<number> {
  try {
    // Migrate videos from anonymous session to registered user
    const count = await storage.migrateVideosFromAnonymousSession(sessionId, userId);
    
    logger.info('Migrated anonymous session data', {
      sessionId,
      userId,
      itemsMigrated: count
    });
    
    // Clear the anonymous session data after successful migration
    await storage.clearAnonymousSessionData(sessionId);
    
    return count;
  } catch (error) {
    logger.error('Failed to migrate anonymous data', {
      error: error instanceof Error ? error.message : String(error),
      sessionId,
      userId
    });
    throw new Error('Failed to migrate anonymous user data');
  }
}

// Export all functions
export const sessionService = {
  // Lifecycle functions
  startSessionCleanup,
  cleanupExpiredSessions,
  
  // Session ID generators
  generateSessionId,
  generateAnonymousSessionId,
  
  // Authenticated user session functions
  createUserSession,
  getUserSession,
  updateUserSessionActivity,
  invalidateUserSession,
  invalidateAllUserSessions,
  
  // Anonymous session functions
  createAnonymousSession,
  getAnonymousSession,
  updateAnonymousSessionActivity,
  getOrCreateAnonymousSession,
  incrementAnonymousVideoCount,
  getAnonymousVideoCount,
  hasReachedAnonymousLimit,
  
  // Data migration
  migrateAnonymousData,
};

// Start the session cleanup task when the service is imported
startSessionCleanup();