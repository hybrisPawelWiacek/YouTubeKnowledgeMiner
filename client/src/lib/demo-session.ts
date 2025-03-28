/**
 * Demo user session management utilities
 * 
 * This module handles demo user session persistence and cleanup
 * to ensure proper logout and session restoration between page refreshes.
 */

import { Session, User } from '@supabase/supabase-js';
import { updateCurrentSession } from './api';

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
    // First store the demo session with our key
    localStorage.setItem(DEMO_SESSION_KEY, JSON.stringify(session));
    
    // Also store in Supabase session storage to ensure both mechanisms work
    localStorage.setItem(SUPABASE_SESSION_KEY, JSON.stringify(session));
    
    // Add a timestamp to track when the session was created
    localStorage.setItem(DEMO_SESSION_KEY + ':timestamp', Date.now().toString());
    
    // Verify session was stored
    const storedSession = localStorage.getItem(DEMO_SESSION_KEY);
    
    if (!storedSession) {
      console.error('[Demo Session] Critical failure: Session not stored in localStorage after set attempt');
    } else {
      console.log('[Demo Session] Successfully stored demo session in localStorage');
      
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
 */
export function getStoredSession(): Session | null {
  try {
    console.log('[Demo Session] Attempting to retrieve stored session');
    
    // Try our demo session key first
    let storedSessionStr = localStorage.getItem(DEMO_SESSION_KEY);
    
    // If not found, check if it's in the Supabase key
    if (!storedSessionStr) {
      console.log('[Demo Session] Demo session not found, checking Supabase session storage');
      storedSessionStr = localStorage.getItem(SUPABASE_SESSION_KEY);
      
      if (storedSessionStr) {
        // Try to parse and verify if it's a demo session
        try {
          const supabaseSession = JSON.parse(storedSessionStr);
          if (supabaseSession?.user?.user_metadata?.is_demo) {
            console.log('[Demo Session] Found demo session in Supabase storage, restoring');
            // Restore the session to our own storage
            localStorage.setItem(DEMO_SESSION_KEY, storedSessionStr);
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
    }
    
    if (!storedSessionStr) {
      console.log('[Demo Session] No stored session found in any storage location');
      return null;
    }

    // Parse the session data
    let session: Session;
    try {
      session = JSON.parse(storedSessionStr) as Session;
    } catch (parseError) {
      console.error('[Demo Session] Failed to parse stored session data:', parseError);
      clearSession(); // Clear invalid data
      return null;
    }
    
    // Validate that this is a demo user session
    if (!session?.user?.user_metadata?.is_demo) {
      console.warn('[Demo Session] Retrieved session is not a demo user session');
      return null;
    }
    
    // Validate user ID exists
    if (!session?.user?.id) {
      console.warn('[Demo Session] Retrieved session has invalid user ID');
      clearSession();
      return null;
    }
    
    // Validate expiration (though demos don't technically expire)
    if (session.expires_at && session.expires_at < Date.now()) {
      console.warn('[Demo Session] Retrieved demo session is expired');
      clearSession();
      return null;
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
  try {
    console.log('[Demo Session] Starting demo user sign out process');
    
    // Define exact anonymous session keys for direct access
    const ANONYMOUS_SESSION_KEY = 'ytk_anonymous_session_id';
    const ANONYMOUS_PRESERVED_KEY = ANONYMOUS_SESSION_KEY + '_preserved';
    
    // Check session keys before cleanup for debugging
    const allStorageKeys = Object.keys(localStorage);
    
    // Check if we actually have a demo session to clear
    const hasDemoSession = localStorage.getItem(DEMO_SESSION_KEY) !== null;
    const hasSupabaseSession = localStorage.getItem(SUPABASE_SESSION_KEY) !== null;
    const hasAnonSession = localStorage.getItem(ANONYMOUS_SESSION_KEY) !== null;
    
    console.log('[Demo Session] Pre-logout state:', { 
      hasDemoSession, 
      hasSupabaseSession,
      hasAnonymousSession: hasAnonSession,
      allStorageKeys
    });
    
    // First, explicitly preserve anonymous session if present (before any cleanup)
    if (hasAnonSession) {
      const anonymousSessionId = localStorage.getItem(ANONYMOUS_SESSION_KEY);
      console.log(`[Demo Session] Found anonymous session to preserve: ${anonymousSessionId}`);
      
      // Direct preservation without using clearAnonymousSession to avoid any race conditions
      localStorage.setItem(ANONYMOUS_PRESERVED_KEY, anonymousSessionId!);
      console.log(`[Demo Session] Directly preserved anonymous session: ${anonymousSessionId}`);
    } else {
      console.log('[Demo Session] No anonymous session found to preserve');
    }
    
    // Now perform a complete cleanup of localStorage
    // This ensures storage is cleared even if React state updates fail
    clearAllSessionData(true); // true indicates to preserve anonymous session
    
    // Now update React state
    setUser(null);
    setSession(null);
    console.log('[Demo Session] React state cleared');
    
    // Clear API module session
    updateCurrentSession(null);
    console.log('[Demo Session] API session state cleared');
    
    // Verify the preserved session is still there
    const preservedSession = localStorage.getItem(ANONYMOUS_PRESERVED_KEY);
    console.log(`[Demo Session] Preserved anonymous session after cleanup: ${preservedSession}`);
    
    // Verify we succeeded with localStorage
    const remainingSessionKeys = Object.keys(localStorage).filter(key => 
      (key.includes('session') || key.includes('supabase')) && 
      key !== ANONYMOUS_PRESERVED_KEY  // Don't count our preserved key
    );
    
    console.log('[Demo Session] Post-logout state:', { 
      remainingKeys: remainingSessionKeys,
      preservedAnonymousSession: preservedSession,
      allRemainingKeys: Object.keys(localStorage)
    });
    
    // Final cleanup if undesired sessions still exist (but preserve anonymous session)
    if (remainingSessionKeys.length > 0) {
      console.log('[Demo Session] Some session data still exists, performing targeted cleanup');
      
      // One more focused cleanup that explicitly protects our preserved key
      remainingSessionKeys.forEach(key => {
        // Never delete the preserved anonymous session
        if (key === ANONYMOUS_PRESERVED_KEY) {
          console.log(`[Demo Session] Final cleanup: skipping preserved key ${key}`);
          return;
        }
        
        console.log(`[Demo Session] Final cleanup: removing ${key}`);
        localStorage.removeItem(key);
      });
    }
    
    // Double check we didn't accidentally remove the preserved session
    if (preservedSession && !localStorage.getItem(ANONYMOUS_PRESERVED_KEY)) {
      console.log('[Demo Session] Preserved session was accidentally removed, restoring it');
      localStorage.setItem(ANONYMOUS_PRESERVED_KEY, preservedSession);
    }
    
    console.log('[Demo Session] Demo user signed out successfully, anonymous session preserved if it existed');
    
    // Wait a bit longer to ensure all async operations complete
    return await new Promise(resolve => setTimeout(() => resolve(true), 200));
  } catch (error) {
    console.error('[Demo Session] Error during sign out:', error);
    
    // Attempt emergency cleanup even in error case
    try {
      clearAllSessionData(false); // false = don't preserve anonymous session in error case
    } catch (e) {
      console.error('[Demo Session] Failed emergency cleanup:', e);
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
    // Define our known session key for anonymous sessions
    const ANONYMOUS_SESSION_KEY = 'ytk_anonymous_session_id';
    const ANONYMOUS_BACKUP_KEY = ANONYMOUS_SESSION_KEY + '_backup';
    const ANONYMOUS_PRESERVED_KEY = ANONYMOUS_SESSION_KEY + '_preserved';
    
    // If we're preserving anonymous session, do that first before any clearing
    if (preserveAnonymousSession) {
      const currentAnonymousSession = localStorage.getItem(ANONYMOUS_SESSION_KEY);
      if (currentAnonymousSession) {
        console.log(`[Demo Session] Found current anonymous session, preserving: ${currentAnonymousSession}`);
        localStorage.setItem(ANONYMOUS_PRESERVED_KEY, currentAnonymousSession);
        console.log(`[Demo Session] Successfully stored anonymous session to preserved key: ${ANONYMOUS_PRESERVED_KEY}`);
      } else {
        console.log(`[Demo Session] No current anonymous session found to preserve`);
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
        console.log(`[Demo Session] Protecting key during cleanup: ${key}`);
        return false;
      }
      
      // Skip the anonymous session preserved key if we're preserving
      if (preserveAnonymousSession && key === ANONYMOUS_PRESERVED_KEY) {
        console.log(`[Demo Session] Preserving anonymous backup key: ${key}`);
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
    
    // Now remove all selected keys
    sessionKeys.forEach(key => {
      // Skip ANONYMOUS_PRESERVED_KEY under any circumstances if preserving
      if (preserveAnonymousSession && key === ANONYMOUS_PRESERVED_KEY) {
        console.log(`[Demo Session] Skipped deletion of preserved anonymous session: ${key}`);
        return;
      }
      
      console.log(`[Demo Session] Clearing session data: ${key}`);
      localStorage.removeItem(key);
    });
    
    console.log('[Demo Session] Cleared all session-related data');
    
    // If we're preserving, log the preserved anonymous session
    if (preserveAnonymousSession) {
      const preservedSession = localStorage.getItem(ANONYMOUS_PRESERVED_KEY);
      
      if (preservedSession) {
        console.log(`[Demo Session] Anonymous session successfully preserved: ${preservedSession}`);
      } else {
        console.log('[Demo Session] No anonymous session was preserved');
      }
    }
  } catch (error) {
    console.error('[Demo Session] Error clearing all session data:', error);
  }
}