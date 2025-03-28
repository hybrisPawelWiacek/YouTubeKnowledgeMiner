/**
 * Demo user session management utilities
 * 
 * This module handles demo user session persistence and cleanup
 * to ensure proper logout and session restoration between page refreshes.
 */

import { Session, User } from '@supabase/supabase-js';
import { updateCurrentSession } from './api';
import { logAuthEvent, logSignIn, logSignOut } from './auth-logger';

// Key for storing the demo user session in localStorage
export const DEMO_SESSION_KEY = 'youtube-miner-demo-session';
// Key for Supabase session - we need to clean this up during logout too
// Importing from use-supabase.tsx would create circular dependencies
export const SUPABASE_SESSION_KEY = 'youtube-miner-supabase-session';

/**
 * Store a demo user session in localStorage
 * This ensures the session persists across page refreshes
 */
export function storeSession(session: Session): void {
  try {
    // Create a more reliable timestamp for session expiry
    if (!session.expires_at) {
      session.expires_at = Date.now() + 3600000; // 1 hour from now
    }
    
    // Add more consistent metadata for demo users
    if (session.user && session.user.user_metadata) {
      // Make sure the demo user flag is always set
      session.user.user_metadata.is_demo = true;
      
      // Store the creation timestamp
      session.user.user_metadata.created_at = Date.now();
      
      // Ensure we have a demo type
      if (!session.user.user_metadata.demo_type) {
        session.user.user_metadata.demo_type = 'basic';
      }
    }
    
    // Prepare storage
    const sessionJSON = JSON.stringify(session);
    
    // Before storing demo session, save any anonymous session for later restoration
    // This is a critical step to ensure we can restore after logout
    const ANONYMOUS_SESSION_KEY = 'ytk_anonymous_session_id';
    const ANONYMOUS_PRESERVED_KEY = ANONYMOUS_SESSION_KEY + '_preserved';
    const currentAnonymousSession = localStorage.getItem(ANONYMOUS_SESSION_KEY);
    
    if (currentAnonymousSession) {
      logAuthEvent('demo_login_preserve_anonymous_session', undefined, { sessionId: currentAnonymousSession });
      localStorage.setItem(ANONYMOUS_PRESERVED_KEY, currentAnonymousSession);
      logAuthEvent('demo_login_anonymous_session_preserved', undefined, { sessionId: currentAnonymousSession });
    } else {
      logAuthEvent('demo_login_no_anonymous_session', undefined);
    }
    
    // Store the demo session 
    localStorage.setItem(DEMO_SESSION_KEY, sessionJSON);
    
    // Also store in Supabase session storage to ensure both mechanisms work
    localStorage.setItem(SUPABASE_SESSION_KEY, sessionJSON);
    
    // Add a timestamp to track when the session was created
    localStorage.setItem(DEMO_SESSION_KEY + ':timestamp', Date.now().toString());
    
    // Verify session was stored
    const storedSession = localStorage.getItem(DEMO_SESSION_KEY);
    const supabaseSession = localStorage.getItem(SUPABASE_SESSION_KEY);
    
    if (!storedSession || !supabaseSession) {
      console.error('[Demo Session] Critical failure: Session not stored in localStorage after set attempt');
      
      // Emergency retry with delay
      setTimeout(() => {
        console.log('[Demo Session] Emergency retry of session storage');
        localStorage.setItem(DEMO_SESSION_KEY, sessionJSON);
        localStorage.setItem(SUPABASE_SESSION_KEY, sessionJSON);
      }, 50);
    } else {
      console.log('[Demo Session] Successfully stored demo session in localStorage');
      console.log('[Demo Session] User info:', {
        id: session.user?.id,
        email: session.user?.email,
        username: session.user?.user_metadata?.username
      });
      
      // Additional debugging to verify the data is valid JSON
      try {
        const parsed = JSON.parse(storedSession);
        if (!parsed || !parsed.user || !parsed.user.id) {
          console.error('[Demo Session] Stored session has invalid format:', parsed);
        }
      } catch (parseError) {
        console.error('[Demo Session] Stored session is not valid JSON:', parseError);
      }
    }
  } catch (error) {
    console.error('[Demo Session] Error storing demo session:', error);
  }
}

/**
 * Get a stored demo user session from localStorage
 * Returns null if no session exists or if the session is invalid
 * This is a critical method that must be robust as it's used during initial page load
 */
export function getStoredSession(): Session | null {
  try {
    console.log('[Demo Session] Attempting to retrieve stored session');
    
    // Log all localStorage keys for debugging
    const allKeys = Object.keys(localStorage);
    const sessionRelatedKeys = allKeys.filter(key => key.includes('session') || key.includes('demo') || key.includes('supabase'));
    console.log('[Demo Session] Available session-related storage keys:', sessionRelatedKeys);
    
    // Try our demo session key first
    let storedSessionStr = localStorage.getItem(DEMO_SESSION_KEY);
    let source = 'demo_storage';
    
    // If not found, check if it's in the Supabase key
    if (!storedSessionStr) {
      console.log('[Demo Session] Demo session not found in primary storage, checking Supabase session storage');
      storedSessionStr = localStorage.getItem(SUPABASE_SESSION_KEY);
      source = 'supabase_storage';
      
      if (storedSessionStr) {
        // Try to parse and verify if it's a demo session
        try {
          const supabaseSession = JSON.parse(storedSessionStr);
          if (supabaseSession?.user?.user_metadata?.is_demo) {
            console.log('[Demo Session] Found demo session in Supabase storage, restoring to demo storage');
            // Restore the session to our own storage
            localStorage.setItem(DEMO_SESSION_KEY, storedSessionStr);
            console.log('[Demo Session] Successfully restored demo session to primary storage');
          } else {
            // Not a demo session
            console.log('[Demo Session] Supabase session exists but is not a demo user session');
            storedSessionStr = null;
          }
        } catch (parseError) {
          console.error('[Demo Session] Error parsing Supabase session:', parseError);
          storedSessionStr = null;
        }
      }
    } else {
      console.log('[Demo Session] Found demo session in primary storage');
    }
    
    if (!storedSessionStr) {
      console.log('[Demo Session] No stored session found in any storage location');
      return null;
    }

    // Parse the session data
    let session: Session;
    try {
      session = JSON.parse(storedSessionStr) as Session;
      
      console.log('[Demo Session] Successfully parsed session from ' + source, {
        user_id: session.user?.id,
        is_demo_user: !!session.user?.user_metadata?.is_demo,
        username: session.user?.user_metadata?.username,
        expires_at: session.expires_at ? new Date(session.expires_at).toISOString() : 'none',
      });
    } catch (parseError) {
      console.error('[Demo Session] Failed to parse stored session data:', parseError);
      // Try to clean up only the invalid data source
      if (source === 'demo_storage') {
        localStorage.removeItem(DEMO_SESSION_KEY);
      } else if (source === 'supabase_storage') {
        localStorage.removeItem(SUPABASE_SESSION_KEY);
      }
      return null;
    }
    
    // Ensure both storage locations have the session for consistency
    try {
      localStorage.setItem(DEMO_SESSION_KEY, storedSessionStr);
      localStorage.setItem(SUPABASE_SESSION_KEY, storedSessionStr);
      console.log('[Demo Session] Ensured session is stored in both locations');
    } catch (storageError) {
      console.error('[Demo Session] Error ensuring consistent session storage:', storageError);
    }
    
    // Validate that this is a demo user session
    if (!session?.user?.user_metadata?.is_demo) {
      console.warn('[Demo Session] Retrieved session is not a demo user session');
      return null;
    }
    
    // Validate user ID exists
    if (!session?.user?.id) {
      console.warn('[Demo Session] Retrieved session has invalid user ID');
      clearSession(); // Clear invalid data
      return null;
    }
    
    // Set a far future expiration if missing
    if (!session.expires_at) {
      console.log('[Demo Session] Setting default expiration for demo session');
      session.expires_at = Date.now() + (24 * 60 * 60 * 1000); // 24 hours from now
      
      // Update storage with corrected session
      try {
        localStorage.setItem(DEMO_SESSION_KEY, JSON.stringify(session));
        localStorage.setItem(SUPABASE_SESSION_KEY, JSON.stringify(session));
      } catch (e) {
        console.error('[Demo Session] Error updating session expiration:', e);
      }
    }
    
    // Validate expiration (though demos don't technically expire)
    if (session.expires_at && session.expires_at < Date.now()) {
      console.warn('[Demo Session] Retrieved demo session is expired, refreshing expiration');
      // Instead of clearing, refresh the expiration for demo users
      session.expires_at = Date.now() + (24 * 60 * 60 * 1000); // 24 hours from now
      
      // Update storage with refreshed session
      try {
        localStorage.setItem(DEMO_SESSION_KEY, JSON.stringify(session));
        localStorage.setItem(SUPABASE_SESSION_KEY, JSON.stringify(session));
      } catch (e) {
        console.error('[Demo Session] Error refreshing session expiration:', e);
      }
    }
    
    console.log('[Demo Session] Retrieved valid demo session from localStorage', {
      userId: session.user.id,
      userEmail: session.user.email,
      userName: session.user.user_metadata?.username || 'unknown'
    });
    
    return session;
  } catch (error) {
    console.error('[Demo Session] Error retrieving demo session:', error);
    return null;
  }
}

/**
 * Clear all demo user session data from localStorage
 * This is called during logout to ensure clean state
 * 
 * @param preserveAnonymousSession If true, attempt to preserve anonymous session for restoration after logout
 */
export function clearSession(preserveAnonymousSession: boolean = true): void {
  try {
    // If we want to preserve anonymous session, do that first before clearing anything
    if (preserveAnonymousSession) {
      try {
        // Using dynamic import to prevent circular dependencies
        import('./anonymous-session').then(({ clearAnonymousSession }) => {
          // The true parameter indicates a temporary clear that preserves for restoration
          clearAnonymousSession(true);
          console.log('[Demo Session] Anonymous session temporarily preserved for later restoration');
        }).catch(importError => {
          console.error('[Demo Session] Error importing anonymous-session module:', importError);
        });
      } catch (anonymousError) {
        console.error('[Demo Session] Error preserving anonymous session:', anonymousError);
      }
    }
    
    // Clear our demo-specific storage
    localStorage.removeItem(DEMO_SESSION_KEY);
    
    // Make sure we also clear the Supabase session, as it might contain demo user info
    localStorage.removeItem(SUPABASE_SESSION_KEY);
    
    // Check if we succeeded
    const stillExists = localStorage.getItem(DEMO_SESSION_KEY) !== null;
    
    if (stillExists) {
      console.error('[Demo Session] CRITICAL: Failed to clear demo session, it still exists after removal');
      
      // Try more aggressive approaches
      try {
        // Try to overwrite with empty data before removal
        localStorage.setItem(DEMO_SESSION_KEY, '');
        localStorage.removeItem(DEMO_SESSION_KEY);
        
        // Final check
        const stillExistsAfterSecondTry = localStorage.getItem(DEMO_SESSION_KEY) !== null;
        if (stillExistsAfterSecondTry) {
          console.error('[Demo Session] CRITICAL: All attempts to clear demo session failed');
        }
      } catch (innerError) {
        console.error('[Demo Session] Inner error during aggressive clear:', innerError);
      }
    } else {
      console.log('[Demo Session] Successfully cleared all demo session data');
    }
  } catch (error) {
    console.error('[Demo Session] Error clearing demo session:', error);
  }
}

/**
 * Determine if the provided user is a demo user
 */
export function isDemoUser(user: User | null): boolean {
  return !!user?.user_metadata?.is_demo;
}

/**
 * Sign out a demo user completely, clearing state and storage
 * This function is much more aggressive about cleaning up sessions
 * 
 * @param setUser React state setter for user
 * @param setSession React state setter for session
 * @returns A promise that resolves to true if successful, false otherwise
 */
export async function signOutDemoUser(
  setUser: (user: User | null) => void,
  setSession: (session: Session | null) => void
): Promise<boolean> {
  // Get user info for logging - define at function scope to make it accessible in catch blocks
  let userId: string | number = 'unknown';
  let username = 'unknown';
  
  try {
    // Try to extract user information for logging
    try {
      const demoSession = localStorage.getItem(DEMO_SESSION_KEY);
      if (demoSession) {
        const parsed = JSON.parse(demoSession);
        userId = parsed?.user?.id || 'unknown';
        username = parsed?.user?.user_metadata?.username || 'unknown';
      }
    } catch (e) {
      // Ignore parsing errors
    }
    
    logSignOut(userId, 'demo', { username });
    logAuthEvent('demo_user_signout_started', userId, { username });
    
    // Define exact anonymous session keys for direct access
    const ANONYMOUS_SESSION_KEY = 'ytk_anonymous_session_id';
    const ANONYMOUS_PRESERVED_KEY = ANONYMOUS_SESSION_KEY + '_preserved';
    
    // Check session keys before cleanup for debugging
    const allStorageKeys = Object.keys(localStorage);
    
    // Check if we actually have a demo session to clear
    const hasDemoSession = localStorage.getItem(DEMO_SESSION_KEY) !== null;
    const hasSupabaseSession = localStorage.getItem(SUPABASE_SESSION_KEY) !== null;
    const hasAnonSession = localStorage.getItem(ANONYMOUS_SESSION_KEY) !== null;
    
    logAuthEvent('demo_user_signout_pre_state', userId, { 
      hasDemoSession, 
      hasSupabaseSession,
      hasAnonymousSession: hasAnonSession,
      storageKeyCount: allStorageKeys.length
    });
    
    // CRITICAL FIX: Update React state FIRST before any localStorage operations
    // This ensures the UI immediately reflects the logged-out state
    logAuthEvent('demo_user_signout_clearing_react_state', userId);
    setUser(null);
    setSession(null);
    
    // Also clear API module session immediately
    updateCurrentSession(null);
    
    // Trigger global auth state refresh to ensure all components update
    window.dispatchEvent(new Event('auth-state-refresh'));
    logAuthEvent('demo_user_signout_react_state_cleared', userId, { auth_refresh_event_triggered: true });

    // Now handle preservation of anonymous session if present
    if (hasAnonSession) {
      const anonymousSessionId = localStorage.getItem(ANONYMOUS_SESSION_KEY);
      logAuthEvent('demo_user_signout_found_anonymous_session', userId, { anonymousSessionId });
      
      // Direct preservation without using clearAnonymousSession to avoid any race conditions
      localStorage.setItem(ANONYMOUS_PRESERVED_KEY, anonymousSessionId!);
      logAuthEvent('demo_user_signout_preserved_anonymous_session', userId, { anonymousSessionId });
    } else {
      logAuthEvent('demo_user_signout_no_anonymous_session', userId);
    }
    
    // Now perform a complete cleanup of localStorage
    // This ensures storage is cleared even if React state updates fail
    logAuthEvent('demo_user_signout_clearing_storage', userId);
    clearAllSessionData(true); // true indicates to preserve anonymous session
    
    // Verify the preserved session is still there
    const preservedSession = localStorage.getItem(ANONYMOUS_PRESERVED_KEY);
    logAuthEvent('demo_user_signout_storage_cleared', userId, { 
      preserved_anonymous_session: preservedSession ? 'present' : 'missing'
    });
    
    // Verify we succeeded with localStorage by checking for remaining session keys
    const remainingSessionKeys = Object.keys(localStorage).filter(key => 
      (key.includes('session') || key.includes('supabase')) && 
      key !== ANONYMOUS_PRESERVED_KEY  // Don't count our preserved key
    );
    
    // Log the post-logout state
    logAuthEvent('demo_user_signout_post_state', userId, { 
      remaining_session_key_count: remainingSessionKeys.length,
      preserved_anonymous_session: preservedSession ? 'present' : 'missing' 
    });
    
    // Final cleanup if undesired sessions still exist (but preserve anonymous session)
    if (remainingSessionKeys.length > 0) {
      logAuthEvent('demo_user_signout_additional_cleanup_needed', userId, { 
        remaining_keys: remainingSessionKeys 
      });
      
      // One more focused cleanup that explicitly protects our preserved key
      remainingSessionKeys.forEach(key => {
        // Never delete the preserved anonymous session
        if (key === ANONYMOUS_PRESERVED_KEY) {
          logAuthEvent('demo_user_signout_skipping_preserved_key', userId, { key });
          return;
        }
        
        logAuthEvent('demo_user_signout_removing_remaining_key', userId, { key });
        localStorage.removeItem(key);
      });
    }
    
    // Double check we didn't accidentally remove the preserved session
    if (preservedSession && !localStorage.getItem(ANONYMOUS_PRESERVED_KEY)) {
      logAuthEvent('demo_user_signout_restoring_lost_anonymous_session', userId, { 
        session_id: preservedSession 
      });
      localStorage.setItem(ANONYMOUS_PRESERVED_KEY, preservedSession);
    }
    
    logAuthEvent('demo_user_signout_complete', userId, {
      success: true,
      preserved_anonymous_session: preservedSession ? 'present' : 'missing'
    });
    
    // Wait a bit longer to ensure all async operations complete
    return await new Promise(resolve => setTimeout(() => resolve(true), 200));
  } catch (error: any) {
    // Use a fixed user ID since we're already in an error state
    const errorUserId = userId || 'unknown'; 
    
    logAuthEvent('demo_user_signout_error', errorUserId, { 
      error_message: error?.toString() || 'Unknown error'
    });
    
    // Attempt emergency cleanup even in error case
    try {
      logAuthEvent('demo_user_signout_emergency_cleanup', errorUserId);
      clearAllSessionData(false); // false = don't preserve anonymous session in error case
    } catch (e: any) {
      logAuthEvent('demo_user_signout_emergency_cleanup_failed', errorUserId, { 
        error_message: e?.toString() || 'Unknown error during cleanup'
      });
    }
    
    return false;
  }
}

/**
 * Clear all session-related data from localStorage
 * More thorough than just clearSession()
 * 
 * @param preserveAnonymousSession If true, don't remove anonymous session backup keys
 */
function clearAllSessionData(preserveAnonymousSession: boolean = false): void {
  try {
    // Try to determine user ID for logging
    let userId = 'unknown';
    try {
      const sessionData = localStorage.getItem(DEMO_SESSION_KEY);
      if (sessionData) {
        const parsed = JSON.parse(sessionData);
        userId = parsed?.user?.id || 'unknown';
      }
    } catch (e) {
      // Ignore parsing errors
    }
    
    // Define our known session key for anonymous sessions
    const ANONYMOUS_SESSION_KEY = 'ytk_anonymous_session_id';
    const ANONYMOUS_BACKUP_KEY = ANONYMOUS_SESSION_KEY + '_backup';
    const ANONYMOUS_PRESERVED_KEY = ANONYMOUS_SESSION_KEY + '_preserved';
    
    // If we're preserving anonymous session, do that first before any clearing
    if (preserveAnonymousSession) {
      const currentAnonymousSession = localStorage.getItem(ANONYMOUS_SESSION_KEY);
      if (currentAnonymousSession) {
        logAuthEvent('demo_session_clearall_preserving_anonymous', userId, { 
          sessionId: currentAnonymousSession 
        });
        localStorage.setItem(ANONYMOUS_PRESERVED_KEY, currentAnonymousSession);
        logAuthEvent('demo_session_clearall_preserved_anonymous', userId, {
          sessionId: currentAnonymousSession,
          preservedKey: ANONYMOUS_PRESERVED_KEY
        });
      } else {
        logAuthEvent('demo_session_clearall_no_anonymous_to_preserve', userId);
      }
    }
    
    // Now remove our explicit keys
    localStorage.removeItem(DEMO_SESSION_KEY);
    localStorage.removeItem(SUPABASE_SESSION_KEY);
    localStorage.removeItem(DEMO_SESSION_KEY + ':timestamp');
    
    // Define keys that should never be deleted during logout
    const protectedKeys = preserveAnonymousSession ? 
      [ANONYMOUS_PRESERVED_KEY] : 
      [];
    
    // Create a list of keys to clear (excluding any protected keys)
    const sessionKeys = Object.keys(localStorage).filter(key => {
      // Skip protected keys
      if (protectedKeys.includes(key)) {
        logAuthEvent('demo_session_clearall_protecting_key', userId, { key });
        return false;
      }
      
      // Skip the anonymous session preserved key if we're preserving
      if (preserveAnonymousSession && key === ANONYMOUS_PRESERVED_KEY) {
        logAuthEvent('demo_session_clearall_preserving_key', userId, { key });
        return false;
      }
      
      // Skip localStorage items not related to sessions or user data
      if (!key.includes('session') && 
          !key.includes('supabase') && 
          !key.includes('youtube-miner') &&
          !key.includes('ytk_')) {
        return false;
      }
      
      return true;
    });
    
    // Log the keys that will be removed
    logAuthEvent('demo_session_clearall_removing_keys', userId, { 
      key_count: sessionKeys.length,
      keys: sessionKeys
    });
    
    // Now remove all selected keys
    sessionKeys.forEach(key => {
      // Skip ANONYMOUS_PRESERVED_KEY under any circumstances if preserving
      if (preserveAnonymousSession && key === ANONYMOUS_PRESERVED_KEY) {
        logAuthEvent('demo_session_clearall_skipped_preserved_key', userId, { key });
        return;
      }
      
      logAuthEvent('demo_session_clearall_removing_key', userId, { key });
      localStorage.removeItem(key);
    });
    
    logAuthEvent('demo_session_clearall_complete', userId);
    
    // If we're preserving, verify the preserved anonymous session
    if (preserveAnonymousSession) {
      const preservedSession = localStorage.getItem(ANONYMOUS_PRESERVED_KEY);
      
      if (preservedSession) {
        logAuthEvent('demo_session_clearall_anonymous_preserved', userId, { 
          sessionId: preservedSession 
        });
      } else {
        logAuthEvent('demo_session_clearall_anonymous_not_preserved', userId);
      }
    }
  } catch (error: any) {
    logAuthEvent('demo_session_clearall_error', 'unknown', { 
      error_message: error?.toString() || 'Unknown error' 
    });
  }
}