/**
 * Anonymous session management utilities
 * 
 * This module handles the creation, storage, and management of anonymous user sessions.
 * Each anonymous user gets their own unique session ID that persists across visits.
 */

import { apiRequest } from './api';

// LocalStorage key for anonymous session ID
const ANONYMOUS_SESSION_KEY = 'ytk_anonymous_session_id';
// LocalStorage key for video count cache
const ANONYMOUS_VIDEO_COUNT_KEY = 'ytk_anonymous_video_count';
// Maximum videos per anonymous session
const ANONYMOUS_VIDEO_LIMIT = 3;

/**
 * Generate a unique session ID for anonymous users
 * 
 * The format is 'anon_[timestamp]_[random]' to ensure uniqueness
 */
export function generateSessionId(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 11);
  return `anon_${timestamp}_${random}`;
}

/**
 * Get the current anonymous session ID from localStorage or create a new one
 * 
 * @param preserveExisting If true, attempts to recover a previous session from a backup key if the main key is missing
 * @returns The session ID
 */
export function getOrCreateAnonymousSessionId(preserveExisting: boolean = true): string {
  try {
    // Log storage state for debugging session persistence
    const sessionKeys = Object.keys(localStorage).filter(key => 
      key.includes('anon') || key.includes('session') || key.includes('ytk_')
    );
    console.debug('[Anonymous Session] Storage state check:', 
      sessionKeys.reduce((obj, key) => {
        obj[key] = localStorage.getItem(key);
        return obj;
      }, {} as Record<string, string | null>)
    );
    
    let sessionId = localStorage.getItem(ANONYMOUS_SESSION_KEY);
    
    // Check for a backup session ID if preserveExisting is true
    const backupKey = ANONYMOUS_SESSION_KEY + '_backup';
    const backupSessionId = preserveExisting ? localStorage.getItem(backupKey) : null;
    const preservedSessionId = preserveExisting ? localStorage.getItem(ANONYMOUS_SESSION_KEY + '_preserved') : null;
    
    console.log(`[Anonymous Session] Initial state - Main: ${sessionId}, Backup: ${backupSessionId}, Preserved: ${preservedSessionId}`);
    
    // Recovery chain - try main, then backup, then preserved
    if (!sessionId && backupSessionId && preserveExisting) {
      sessionId = backupSessionId;
      localStorage.setItem(ANONYMOUS_SESSION_KEY, sessionId);
      console.log('[Anonymous Session] Restored session from backup:', sessionId);
    } else if (!sessionId && preservedSessionId && preserveExisting) {
      // Last resort - check for a preserved session from a previous login
      sessionId = preservedSessionId;
      localStorage.setItem(ANONYMOUS_SESSION_KEY, sessionId);
      localStorage.removeItem(ANONYMOUS_SESSION_KEY + '_preserved'); // Clean up
      console.log('[Anonymous Session] Restored session from preserved backup:', sessionId);
    }
    
    // If no session exists at all, create a new one
    if (!sessionId) {
      sessionId = generateSessionId();
      localStorage.setItem(ANONYMOUS_SESSION_KEY, sessionId);
      console.log('[Anonymous Session] Created new session:', sessionId);
    } else {
      console.log('[Anonymous Session] Using existing session:', sessionId);
    }
    
    // Always maintain a backup copy
    localStorage.setItem(backupKey, sessionId);
    
    // Update timestamps for tracking
    localStorage.setItem(ANONYMOUS_SESSION_KEY + '_last_accessed', Date.now().toString());
    
    return sessionId;
  } catch (error) {
    console.error('[Anonymous Session] Error in getOrCreateAnonymousSessionId:', error);
    // Fallback to memory-only session if localStorage fails
    return generateSessionId();
  }
}

/**
 * Store anonymous session in a secure cookie and localStorage for better persistence
 * @param sessionId The session ID to store
 */
export function storeAnonymousSessionId(sessionId: string): void {
  if (!sessionId) return;
  
  // Store in multiple locations for redundancy
  localStorage.setItem(ANONYMOUS_SESSION_KEY, sessionId);
  localStorage.setItem(ANONYMOUS_SESSION_KEY + '_backup', sessionId);
  
  // Set timestamp of last store operation
  localStorage.setItem(ANONYMOUS_SESSION_KEY + '_timestamp', Date.now().toString());
  console.log('[Anonymous Session] Session stored:', sessionId);
}

/**
 * Clear the anonymous session
 * Call this when a user logs in to ensure they don't keep using the anonymous session
 * 
 * @param temporary If true, the session is saved to a backup key for potential restoration later
 */
export function clearAnonymousSession(temporary: boolean = false): void {
  try {
    // Log current storage state for debugging
    const sessionKeys = {
      main: localStorage.getItem(ANONYMOUS_SESSION_KEY),
      backup: localStorage.getItem(ANONYMOUS_SESSION_KEY + '_backup'),
      preserved: localStorage.getItem(ANONYMOUS_SESSION_KEY + '_preserved')
    };
    
    console.log('[Anonymous Session] Pre-clear state:', sessionKeys);
    
    // If we're clearing temporarily (such as during login), save the current session
    // to a backup key so it can be restored when the user logs out
    if (temporary) {
      const currentSession = localStorage.getItem(ANONYMOUS_SESSION_KEY);
      
      if (currentSession) {
        console.log('[Anonymous Session] Temporarily preserving session:', currentSession);
        
        // Store with timestamp to help with debugging
        const preserveData = {
          session: currentSession,
          preserved_at: Date.now(),
          source: 'clearAnonymousSession'
        };
        
        // Store the session ID directly
        localStorage.setItem(ANONYMOUS_SESSION_KEY + '_preserved', currentSession);
        
        // Also store detailed metadata
        try {
          localStorage.setItem(
            ANONYMOUS_SESSION_KEY + '_preserved_meta',
            JSON.stringify(preserveData)
          );
        } catch (metaError) {
          console.error('[Anonymous Session] Error storing preservation metadata:', metaError);
        }
        
        console.log('[Anonymous Session] Session temporarily preserved:', currentSession);
      } else {
        console.log('[Anonymous Session] No session found to preserve');
      }
    } else {
      // If we're clearing permanently, also remove any backup sessions (but NOT preserved)
      console.log('[Anonymous Session] Permanently clearing session');
      
      if (temporary === false) {
        // Only remove backup keys, NOT the preserved key which is used after logout
        localStorage.removeItem(ANONYMOUS_SESSION_KEY + '_backup');
        
        // These should only be cleared in a permanent wipe scenario
        localStorage.removeItem(ANONYMOUS_SESSION_KEY + '_timestamp');
        localStorage.removeItem(ANONYMOUS_SESSION_KEY + '_last_accessed');
        localStorage.removeItem(ANONYMOUS_SESSION_KEY + '_restored_at');
        localStorage.removeItem(ANONYMOUS_SESSION_KEY + '_emergency');
        
        console.log('[Anonymous Session] Removed backup keys (permanent clear)');
      }
    }
    
    // Always remove the main session key
    localStorage.removeItem(ANONYMOUS_SESSION_KEY);
    
    // Delay checking to ensure operations have completed
    setTimeout(() => {
      // Verify cleared state
      const verifyState = {
        mainAfterClear: localStorage.getItem(ANONYMOUS_SESSION_KEY),
        preservedAfterClear: localStorage.getItem(ANONYMOUS_SESSION_KEY + '_preserved'),
        allKeysAfterClear: Object.keys(localStorage).filter(key => key.includes('anon') || key.includes('ytk'))
      };
      
      console.log('[Anonymous Session] Post-clear state:', verifyState);
      
      // Emergency fix if clearing failed
      if (verifyState.mainAfterClear !== null) {
        console.error('[Anonymous Session] CRITICAL: Session not cleared properly, forcing empty value');
        localStorage.setItem(ANONYMOUS_SESSION_KEY, '');
        localStorage.removeItem(ANONYMOUS_SESSION_KEY);
      }
      
      // Make sure preserved session still exists if this was a temporary clear
      if (temporary && sessionKeys.main && !verifyState.preservedAfterClear) {
        console.error('[Anonymous Session] CRITICAL: Preserved session lost during clear, restoring it');
        localStorage.setItem(ANONYMOUS_SESSION_KEY + '_preserved', sessionKeys.main);
      }
    }, 50);
    
    console.log('[Anonymous Session] Session cleared (temporary: ' + temporary + ')');
  } catch (error) {
    console.error('[Anonymous Session] Error clearing session:', error);
    
    // Last-ditch attempt
    try {
      localStorage.removeItem(ANONYMOUS_SESSION_KEY);
    } catch (e) {
      console.error('[Anonymous Session] Critical failure clearing session:', e);
    }
  }
}

/**
 * Restore a previously preserved anonymous session
 * Used after logout to return to the anonymous session a user had before logging in
 * 
 * @returns The restored session ID or null if no preserved session exists
 */
export function restorePreservedAnonymousSession(): string | null {
  try {
    console.log('[Anonymous Session] Starting session restoration process');
    
    // Check all potential session storage keys to better understand the state
    const sessionKeys = {
      main: localStorage.getItem(ANONYMOUS_SESSION_KEY),
      backup: localStorage.getItem(ANONYMOUS_SESSION_KEY + '_backup'),
      preserved: localStorage.getItem(ANONYMOUS_SESSION_KEY + '_preserved'),
      timestamp: localStorage.getItem(ANONYMOUS_SESSION_KEY + '_timestamp')
    };
    
    console.log('[Anonymous Session] Current storage state:', sessionKeys);
    
    // We primarily want to restore from the preserved key
    const preservedSession = sessionKeys.preserved;
    
    if (preservedSession) {
      console.log('[Anonymous Session] Found preserved session to restore:', preservedSession);
      
      // Force a clean slate by removing any existing session keys first
      localStorage.removeItem(ANONYMOUS_SESSION_KEY);
      localStorage.removeItem(ANONYMOUS_SESSION_KEY + '_backup');
      localStorage.removeItem(ANONYMOUS_SESSION_KEY + '_timestamp');
      
      // Small delay to ensure removal operations complete
      setTimeout(() => {
        // Store the session ID in multiple places for redundancy
        localStorage.setItem(ANONYMOUS_SESSION_KEY, preservedSession);
        localStorage.setItem(ANONYMOUS_SESSION_KEY + '_backup', preservedSession);
        
        // Set timestamp of restoration
        const now = Date.now();
        localStorage.setItem(ANONYMOUS_SESSION_KEY + '_timestamp', now.toString());
        localStorage.setItem(ANONYMOUS_SESSION_KEY + '_last_accessed', now.toString());
        
        // Add a refresh timestamp for tracking when the session was last restored
        localStorage.setItem(ANONYMOUS_SESSION_KEY + '_restored_at', now.toString());
        
        // Clear the preserved backup once it's been restored to prevent duplicate restores
        localStorage.removeItem(ANONYMOUS_SESSION_KEY + '_preserved');
        
        console.log('[Anonymous Session] Session restored successfully:', {
          session: preservedSession,
          timestamp: new Date(now).toISOString()
        });
      }, 50);
      
      // Immediately return the session ID even though async operations are still happening
      return preservedSession;
    } else {
      console.log('[Anonymous Session] No preserved session found to restore');
      
      // Check if we should create a brand new session since none was preserved
      if (!sessionKeys.main && !sessionKeys.backup) {
        const newSession = generateSessionId();
        console.log('[Anonymous Session] Creating new session since no preserved session exists:', newSession);
        
        localStorage.setItem(ANONYMOUS_SESSION_KEY, newSession);
        localStorage.setItem(ANONYMOUS_SESSION_KEY + '_backup', newSession);
        localStorage.setItem(ANONYMOUS_SESSION_KEY + '_timestamp', Date.now().toString());
        
        return newSession;
      }
    }
    
    return null;
  } catch (error) {
    console.error('[Anonymous Session] Error restoring preserved session:', error);
    
    // Create emergency fallback session to ensure user experience continues
    try {
      const emergencySession = generateSessionId();
      console.log('[Anonymous Session] Creating emergency session due to restore error:', emergencySession);
      
      localStorage.setItem(ANONYMOUS_SESSION_KEY, emergencySession);
      localStorage.setItem(ANONYMOUS_SESSION_KEY + '_backup', emergencySession);
      localStorage.setItem(ANONYMOUS_SESSION_KEY + '_timestamp', Date.now().toString());
      localStorage.setItem(ANONYMOUS_SESSION_KEY + '_emergency', 'true');
      
      return emergencySession;
    } catch (backupError) {
      console.error('[Anonymous Session] Critical error creating emergency session:', backupError);
      return null;
    }
  }
}

/**
 * Check if user has an anonymous session
 */
export function hasAnonymousSession(): boolean {
  return !!localStorage.getItem(ANONYMOUS_SESSION_KEY);
}

/**
 * Get the current video count from server or return 0 if not available
 * This is a deprecated function that now just returns 0 because we no longer store counts in local storage
 * @deprecated Use server API calls directly instead
 */
export function getLocalAnonymousVideoCount(): number {
  return 0;
}

/**
 * This function is deprecated as we no longer store video counts in local storage
 * @deprecated Use server API calls instead
 */
export function setLocalAnonymousVideoCount(count: number): void {
  console.warn('setLocalAnonymousVideoCount is deprecated - server now tracks video counts');
}

/**
 * Get the current video count and maximum allowed videos from the server
 * @returns A promise that resolves to an object with the current count and max allowed videos
 */
export async function getAnonymousVideoCountInfo(): Promise<{ count: number; maxAllowed: number }> {
  try {
    if (!hasAnonymousSession()) {
      return { count: 0, maxAllowed: ANONYMOUS_VIDEO_LIMIT };
    }
    
    const sessionId = getOrCreateAnonymousSessionId();
    const headers = {
      'x-anonymous-session': sessionId
    };
    
    // Use fetch directly to avoid circular dependencies
    const response = await fetch('/api/anonymous/videos/count', {
      method: 'GET',
      headers,
      credentials: 'include'
    });
    
    if (!response.ok) {
      console.warn(`[Anonymous] Error getting video count: ${response.status}`);
      return { count: 0, maxAllowed: ANONYMOUS_VIDEO_LIMIT };
    }
    
    const data = await response.json();
    
    if (data && typeof data.count === 'number') {
      // Get max_allowed from response or use default
      const maxAllowed = typeof data.max_allowed === 'number' 
        ? data.max_allowed 
        : ANONYMOUS_VIDEO_LIMIT;
      
      console.log('[Anonymous Session] Video count info from server:', { count: data.count, maxAllowed });
      return { count: data.count, maxAllowed };
    }
    
    return { count: 0, maxAllowed: ANONYMOUS_VIDEO_LIMIT };
  } catch (error) {
    console.error('[Anonymous] Error fetching video count info:', error);
    return { count: 0, maxAllowed: ANONYMOUS_VIDEO_LIMIT };
  }
}

/**
 * Check if anonymous user has reached their video limit
 * This makes a server call to check the current count for this anonymous session
 * @returns A promise that resolves to a boolean indicating whether the limit has been reached
 */
export async function hasReachedAnonymousLimit(): Promise<boolean> {
  try {
    console.log('[Anonymous] Checking if video limit reached');
    
    // Use the getAnonymousVideoCountInfo function to avoid duplicating code
    const { count, maxAllowed } = await getAnonymousVideoCountInfo();
    
    const hasReached = count >= maxAllowed;
    console.log(`[Anonymous] Video count: ${count}/${maxAllowed} - Limit reached: ${hasReached}`);
    
    return hasReached;
  } catch (error) {
    console.error('[Anonymous] Error checking anonymous limit:', error);
    
    // If we can't check the limit due to an error, assume they haven't reached it
    // This errs on the side of letting users continue rather than blocking them incorrectly
    return false;
  }
}

/**
 * Synchronous version that always assumes the user hasn't reached the limit
 * This is a fallback for UI components that need immediate responses
 * The proper way is to use the async version and handle loading states
 */
export function hasReachedAnonymousLimitSync(): boolean {
  // We no longer store this information locally, so this function 
  // now only provides a safe fallback for components that can't wait for async
  return false;
}