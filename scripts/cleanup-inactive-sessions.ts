/**
 * This script removes inactive anonymous sessions and their associated data
 * It's designed to be run as a scheduled task (e.g., daily or weekly)
 */

import { dbStorage } from '../server/database-storage';
import { db } from '../server/db';
import { videos } from '../shared/schema';
import { eq } from 'drizzle-orm';

const INACTIVE_DAYS = 30; // Sessions inactive for this many days will be removed

async function cleanupInactiveSessions() {
  console.log(`[Session Cleanup] Starting cleanup of anonymous sessions inactive for ${INACTIVE_DAYS} days`);
  
  try {
    // First, get the list of session IDs that will be deleted
    // This allows us to delete related data first
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - INACTIVE_DAYS);
    
    console.log(`[Session Cleanup] Finding sessions inactive since: ${cutoffDate.toISOString()}`);
    
    // Get inactive sessions before deleting them
    const inactiveSessions = await db.query.anonymous_sessions.findMany({
      where: (sessions, { lt }) => lt(sessions.last_active_at, cutoffDate)
    });
    
    if (inactiveSessions.length === 0) {
      console.log('[Session Cleanup] No inactive sessions found');
      return;
    }

    console.log(`[Session Cleanup] Found ${inactiveSessions.length} inactive sessions to clean up`);
    
    // For each session, delete associated videos first
    for (const session of inactiveSessions) {
      const sessionId = session.session_id;
      console.log(`[Session Cleanup] Processing session: ${sessionId}`);
      
      // Get videos for this session
      const sessionVideos = await dbStorage.getVideosByAnonymousSessionId(sessionId);
      
      if (sessionVideos.length > 0) {
        console.log(`[Session Cleanup] Deleting ${sessionVideos.length} videos for session ${sessionId}`);
        
        // Delete each video (this will also clean up related data like collection_videos)
        for (const video of sessionVideos) {
          await dbStorage.deleteVideo(video.id);
        }
      } else {
        console.log(`[Session Cleanup] No videos found for session ${sessionId}`);
      }
    }
    
    // Delete the inactive sessions
    const deletedCount = await dbStorage.deleteInactiveAnonymousSessions(INACTIVE_DAYS);
    
    console.log(`[Session Cleanup] Successfully deleted ${deletedCount} inactive anonymous sessions`);
  } catch (error) {
    console.error('[Session Cleanup] Error during cleanup:', error);
  }
}

// Run the cleanup
cleanupInactiveSessions()
  .then(() => {
    console.log('[Session Cleanup] Completed successfully');
    process.exit(0);
  })
  .catch(error => {
    console.error('[Session Cleanup] Fatal error:', error);
    process.exit(1);
  });