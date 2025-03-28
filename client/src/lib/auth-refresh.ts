/**
 * Auth Refresh Utilities
 * 
 * This module provides utilities to force-refresh the authentication state
 * when needed, particularly after logout operations.
 */

import { refreshSupabaseState } from '../hooks/use-supabase-internal';

/**
 * Helper function to restore anonymous session state after logout
 * This centralizes the session restoration logic
 */
function restoreAnonymousSession() {
  try {
    const ANONYMOUS_SESSION_KEY = 'ytk_anonymous_session_id';
    const ANONYMOUS_PRESERVED_KEY = ANONYMOUS_SESSION_KEY + '_preserved';
    const ANONYMOUS_BACKUP_KEY = ANONYMOUS_SESSION_KEY + '_backup';
    
    // First check if we have a backup or preserved session to restore
    const backupSession = localStorage.getItem(ANONYMOUS_BACKUP_KEY);
    const preservedSession = localStorage.getItem(ANONYMOUS_PRESERVED_KEY);
    
    // Log the current anonymous session state
    console.log('[Auth Refresh] Anonymous session state:', {
      current: localStorage.getItem(ANONYMOUS_SESSION_KEY),
      backup: backupSession,
      preserved: preservedSession
    });
    
    if (preservedSession) {
      console.log(`[Auth Refresh] Restoring preserved anonymous session: ${preservedSession}`);
      
      // Restore from preserved session
      localStorage.setItem(ANONYMOUS_SESSION_KEY, preservedSession);
      localStorage.setItem(ANONYMOUS_SESSION_KEY + '_restored_at', Date.now().toString());
      localStorage.setItem(ANONYMOUS_SESSION_KEY + '_restored_by', 'auth_refresh');
      localStorage.setItem(ANONYMOUS_SESSION_KEY + '_last_accessed', Date.now().toString());
      
      // Clear preserved session since we've restored it
      localStorage.removeItem(ANONYMOUS_PRESERVED_KEY);
      localStorage.removeItem(ANONYMOUS_PRESERVED_KEY + '_meta');
      localStorage.removeItem(ANONYMOUS_PRESERVED_KEY + '_timestamp');
      
      return { anonymousSessionId: preservedSession, source: 'preserved' };
    } 
    else if (backupSession) {
      console.log(`[Auth Refresh] Restoring backup anonymous session: ${backupSession}`);
      
      // Restore from backup
      localStorage.setItem(ANONYMOUS_SESSION_KEY, backupSession);
      localStorage.setItem(ANONYMOUS_SESSION_KEY + '_restored_at', Date.now().toString());
      localStorage.setItem(ANONYMOUS_SESSION_KEY + '_restored_by', 'auth_refresh_backup');
      localStorage.setItem(ANONYMOUS_SESSION_KEY + '_last_accessed', Date.now().toString());
      
      return { anonymousSessionId: backupSession, source: 'backup' };
    }
    else {
      console.log('[Auth Refresh] No preserved or backup anonymous session found');
      return null;
    }
  } catch (error) {
    console.error('[Auth Refresh] Error restoring anonymous session:', error);
    return null;
  }
}

/**
 * Force refresh the application's authentication state
 * This is used when the UI needs to be updated after auth state changes
 * without requiring a full page reload.
 */
export function refreshAuthState() {
  console.log("[Auth Refresh] Manual refresh requested");
  
  // Check if we need to restore an anonymous session after logout
  try {
    // This is a good place to check if we've just logged out
    // We can detect this by looking at demo and supabase session status
    const demoSession = localStorage.getItem('youtube-miner-demo-session');
    const supabaseSession = localStorage.getItem('youtube-miner-supabase-session');
    
    // If no active sessions, it's likely we just logged out
    if (!demoSession && !supabaseSession) {
      console.log('[Auth Refresh] No active sessions found, checking for anonymous session to restore');
      const restored = restoreAnonymousSession();
      
      if (restored) {
        console.log('[Auth Refresh] Restoring anonymous session', restored);
      }
    }
  } catch (error) {
    console.error('[Auth Refresh] Error in session restoration check:', error);
  }
  
  // Call the refresh function from use-supabase-internal
  refreshSupabaseState();
  
  // Dispatch a global event that components can listen for
  window.dispatchEvent(new Event('auth-state-refresh'));
}