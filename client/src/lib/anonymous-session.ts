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
  localStorage.removeItem(ANONYMOUS_VIDEO_COUNT_KEY);
  console.log('[Anonymous Session] Session cleared');
}

/**
 * Check if user has an anonymous session
 */
export function hasAnonymousSession(): boolean {
  return !!localStorage.getItem(ANONYMOUS_SESSION_KEY);
}

/**
 * Get the current video count for anonymous users from local cache
 * This should only be used for UI hints while waiting for server response
 */
export function getLocalAnonymousVideoCount(): number {
  const countStr = localStorage.getItem(ANONYMOUS_VIDEO_COUNT_KEY);
  return countStr ? parseInt(countStr, 10) : 0;
}

/**
 * Update the local cache of anonymous video count
 * This is just a helper for the UI to show limits without server roundtrips
 */
export function setLocalAnonymousVideoCount(count: number): void {
  localStorage.setItem(ANONYMOUS_VIDEO_COUNT_KEY, count.toString());
}

/**
 * Check if anonymous user has reached their video limit
 * First tries to get data from server, falls back to local cache if needed
 */
export async function hasReachedAnonymousLimit(): Promise<boolean> {
  try {
    if (!hasAnonymousSession()) {
      return false;
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
      throw new Error(`Error getting video count: ${response.status}`);
    }
    
    const data = await response.json();
    
    // Update local cache for future reference
    if (data && typeof data.count === 'number') {
      setLocalAnonymousVideoCount(data.count);
      const maxAllowed = data.max_allowed || ANONYMOUS_VIDEO_LIMIT;
      return data.count >= maxAllowed;
    }
    
    // Fall back to local cache if server response is invalid
    return getLocalAnonymousVideoCount() >= ANONYMOUS_VIDEO_LIMIT;
  } catch (error) {
    console.error('Error checking anonymous limit:', error);
    
    // Fall back to local cache on error
    return getLocalAnonymousVideoCount() >= ANONYMOUS_VIDEO_LIMIT;
  }
}

/**
 * Synchronous version of hasReachedAnonymousLimit that only uses local cache
 * Use this when you need an immediate response without waiting for a network request
 */
export function hasReachedAnonymousLimitSync(): boolean {
  return getLocalAnonymousVideoCount() >= ANONYMOUS_VIDEO_LIMIT;
}