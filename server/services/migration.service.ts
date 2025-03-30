/**
 * Migration Service
 * 
 * Handles migration of user data, especially when converting from anonymous
 * to registered user after registration/login.
 */

import { db } from '../db';
import { videos, anonymous_sessions } from '../../shared/schema';
import { eq } from 'drizzle-orm';
import winston from 'winston';

// Configure logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  defaultMeta: { service: 'migration' },
  transports: [
    new winston.transports.File({ filename: 'logs/migration.log' }),
  ],
});

// If we're in development, also log to the console
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.simple(),
  }));
}

/**
 * Migrate videos from an anonymous session to a registered user
 * @param anonymousSessionId The anonymous session ID
 * @param userId The user ID to migrate to
 * @returns Object containing the number of migrated items
 */
export async function migrateAnonymousData(
  anonymousSessionId: string,
  userId: number
): Promise<{ migratedVideos: number }> {
  logger.info(`Starting migration from session ${anonymousSessionId} to user ${userId}`);
  
  try {
    // Verify that the anonymous session ID has the correct format
    if (!anonymousSessionId.startsWith('anon_')) {
      logger.error(`Invalid anonymous session ID format: ${anonymousSessionId}`);
      throw new Error('Invalid anonymous session ID format');
    }
    
    // Verify that the anonymous session exists
    const sessionResults = await db
      .select()
      .from(anonymous_sessions)
      .where(eq(anonymous_sessions.session_id, anonymousSessionId));
    
    if (sessionResults.length === 0) {
      logger.error(`Anonymous session not found: ${anonymousSessionId}`);
      throw new Error('Anonymous session not found');
    }
    
    // Get videos from the anonymous session
    const results = await db
      .select()
      .from(videos)
      .where(eq(videos.anonymous_session_id, anonymousSessionId));
    
    if (results.length === 0) {
      logger.info('No videos found to migrate');
      return { migratedVideos: 0 };
    }
    
    logger.info(`Found ${results.length} videos to migrate`);
    
    // Update videos to be associated with the registered user
    const updateResults = await db
      .update(videos)
      .set({
        user_id: userId,
        anonymous_session_id: null,
        user_type: 'registered'
      })
      .where(eq(videos.anonymous_session_id, anonymousSessionId))
      .returning();
    
    // Update anonymous session to mark it as migrated
    // Use metadata for storing the user ID it was migrated to
    let newMetadata: Record<string, any> = {};
    
    // Copy existing metadata if available
    if (sessionResults[0].metadata) {
      Object.assign(newMetadata, sessionResults[0].metadata);
    }
    
    // Add migration information
    newMetadata.migrated_to_user_id = userId;
    newMetadata.migrated_at = new Date().toISOString();
    
    await db
      .update(anonymous_sessions)
      .set({
        metadata: newMetadata
      })
      .where(eq(anonymous_sessions.session_id, anonymousSessionId));
    
    logger.info(`Successfully migrated ${updateResults.length} videos`);
    
    return { migratedVideos: updateResults.length };
  } catch (error) {
    logger.error('Migration error:', error);
    throw new Error(`Migration failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}