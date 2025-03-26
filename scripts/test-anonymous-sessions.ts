/**
 * Test script for anonymous session functionality
 * This script creates, updates, and tests anonymous sessions
 */

import { dbStorage } from '../server/database-storage';

async function testAnonymousSessions() {
  console.log("=== Testing Anonymous Sessions ===");
  
  // Generate a test session ID
  const sessionId = `test_session_${Date.now()}`;
  
  try {
    // Step 1: Create a new anonymous session
    console.log("\n1. Creating new anonymous session with ID:", sessionId);
    
    const session = await dbStorage.createAnonymousSession({
      session_id: sessionId,
      user_agent: "Anonymous Session Test Script",
      ip_address: "127.0.0.1"
    });
    
    console.log("Created session:", {
      id: session.id,
      session_id: session.session_id,
      created_at: session.created_at,
      last_active_at: session.last_active_at,
      video_count: session.video_count
    });
    
    // Step 2: Update the session's last active time
    console.log("\n2. Updating session last active time");
    
    await dbStorage.updateAnonymousSessionLastActive(sessionId);
    
    const updatedSession = await dbStorage.getAnonymousSessionBySessionId(sessionId);
    
    console.log("Session after update:", {
      id: updatedSession?.id,
      session_id: updatedSession?.session_id,
      created_at: updatedSession?.created_at,
      last_active_at: updatedSession?.last_active_at,
      video_count: updatedSession?.video_count
    });
    
    // Step 3: Increment the video count
    console.log("\n3. Increment video count");
    
    const updatedCount = await dbStorage.incrementAnonymousSessionVideoCount(sessionId);
    
    console.log("New video count:", updatedCount);
    
    const sessionAfterIncrement = await dbStorage.getAnonymousSessionBySessionId(sessionId);
    
    console.log("Session after increment:", {
      id: sessionAfterIncrement?.id,
      session_id: sessionAfterIncrement?.session_id,
      created_at: sessionAfterIncrement?.created_at,
      last_active_at: sessionAfterIncrement?.last_active_at,
      video_count: sessionAfterIncrement?.video_count
    });
    
    // Step 4: Test cleanup by creating an inactive session
    console.log("\n4. Testing cleanup of inactive sessions");
    
    const oldSessionId = `old_test_session_${Date.now()}`;
    
    // Create an old session with timestamp 31 days in the past
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 31);
    
    // We'll simulate this by directly modifying DB record after creation
    const oldSession = await dbStorage.createAnonymousSession({
      session_id: oldSessionId,
      user_agent: "Inactive Session Test",
      ip_address: "127.0.0.1"
    });
    
    console.log("Created old session:", oldSessionId);
    
    // Use the database directly to update the last_active_at field
    const { db } = await import('../server/db');
    const { anonymous_sessions } = await import('../shared/schema');
    const { eq } = await import('drizzle-orm');
    
    await db.update(anonymous_sessions)
      .set({ 
        last_active_at: oldDate 
      })
      .where(eq(anonymous_sessions.session_id, oldSessionId));
    
    console.log("Set old session last_active_at to", oldDate.toISOString());
    
    // Step 5: Test the cleanup function
    console.log("\n5. Running cleanup for sessions older than 30 days");
    
    const deletedCount = await dbStorage.deleteInactiveAnonymousSessions(30);
    
    console.log(`Deleted ${deletedCount} inactive sessions`);
    
    // Verify our test session is still there but old one is gone
    const stillActive = await dbStorage.getAnonymousSessionBySessionId(sessionId);
    const shouldBeDeleted = await dbStorage.getAnonymousSessionBySessionId(oldSessionId);
    
    console.log("Active session still exists:", !!stillActive);
    console.log("Inactive session was deleted:", !shouldBeDeleted);
    
    console.log("\n=== Testing completed successfully ===");
  } catch (error) {
    console.error("Error during test:", error);
  }
}

// Run the test
testAnonymousSessions()
  .then(() => {
    console.log("All tests completed");
    process.exit(0);
  })
  .catch(error => {
    console.error("Fatal error during tests:", error);
    process.exit(1);
  });