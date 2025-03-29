/**
 * Migration Service
 * 
 * This service handles the migration of data from anonymous sessions 
 * to registered user accounts. It provides functions to:
 * 
 * - Migrate videos from anonymous sessions to registered users
 * - Handle the migration process in a transaction-safe way
 * - Clean up anonymous sessions after successful migration
 */

import { storage } from '../storage';
import { createLogger } from './logger';

const logger = createLogger('migration');

/**
 * Migrate anonymous user data to a newly registered user
 * @param sessionId Anonymous session ID
 * @param userId User ID to migrate data to
 * @returns Object with migration results
 */
export async function migrateAnonymousUserData(
  sessionId: string,
  userId: number
): Promise<{ success: boolean; migratedVideos: number; error?: string }> {
  logger.info('Starting migration process', { sessionId, userId });
  
  try {
    // Check if the anonymous session exists
    const session = await storage.getAnonymousSessionBySessionId(sessionId);
    if (!session) {
      logger.warn('No anonymous session found for migration', { sessionId });
      return { success: false, migratedVideos: 0, error: 'Anonymous session not found' };
    }

    // Check if the user exists
    const user = await storage.getUser(userId);
    if (!user) {
      logger.warn('User not found for migration', { userId });
      return { success: false, migratedVideos: 0, error: 'User not found' };
    }

    // Get videos from the anonymous session
    const videos = await storage.getVideosByAnonymousSessionId(sessionId);
    if (!videos.length) {
      logger.info('No videos to migrate', { sessionId });
      return { success: true, migratedVideos: 0 };
    }

    // Migrate the videos in a transaction
    const migratedVideos = await storage.migrateVideosFromAnonymousSession(sessionId, userId);
    
    // Clear the anonymous session data
    await storage.clearAnonymousSessionData(sessionId);
    
    logger.info('Migration completed successfully', { 
      sessionId, 
      userId, 
      migratedVideos 
    });
    
    return {
      success: true,
      migratedVideos
    };
  } catch (error) {
    logger.error('Error during anonymous data migration', {
      error: error instanceof Error ? error.message : String(error),
      sessionId,
      userId
    });
    
    return {
      success: false,
      migratedVideos: 0,
      error: 'Failed to migrate anonymous user data'
    };
  }
}