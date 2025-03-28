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
 */
export function getOrCreateAnonymousSessionId(): string {
  // Check if we're using a demo user account - never create anonymous sessions for demo users
  const DEMO_SESSION_KEY = 'youtube-miner-demo-session';
  const hasDemoSession = localStorage.getItem(DEMO_SESSION_KEY) !== null;
  
  if (hasDemoSession) {
    console.log('[Anonymous Session] Demo user detected, not creating/using anonymous session');
    // Return a dummy session ID that won't be stored
    return 'demo_user_no_anonymous_session';
  }
  
  let sessionId = localStorage.getItem(ANONYMOUS_SESSION_KEY);
  
  // If no session exists, create one
  if (!sessionId) {
    sessionId = generateSessionId();
    localStorage.setItem(ANONYMOUS_SESSION_KEY, sessionId);
    console.log('[Anonymous Session] Created new session:', sessionId);
  } else {
    console.log('[Anonymous Session] Using existing session:', sessionId);
  }
  
  return sessionId;
}

/**
 * Clear the anonymous session
 * Call this when a user logs in to ensure they don't keep using the anonymous session
 */
export function clearAnonymousSession(): void {
  localStorage.removeItem(ANONYMOUS_SESSION_KEY);
  // Video count is no longer stored in localStorage, it's tracked on the server
  console.log('[Anonymous Session] Session cleared');
}

/**
 * Check if user has an anonymous session
 */
export function hasAnonymousSession(): boolean {
  // Check if we're using a demo user account - never use anonymous sessions for demo users
  const DEMO_SESSION_KEY = 'youtube-miner-demo-session';
  const hasDemoSession = localStorage.getItem(DEMO_SESSION_KEY) !== null;
  
  if (hasDemoSession) {
    // Demo users don't use anonymous sessions
    return false;
  }
  
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