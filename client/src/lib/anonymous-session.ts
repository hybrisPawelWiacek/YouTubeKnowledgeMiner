/**
 * Anonymous session management utilities
 * 
 * This module handles the creation, storage, and management of anonymous user sessions.
 * Each anonymous user gets their own unique session ID that persists across visits.
 */

// LocalStorage key for anonymous session ID
const ANONYMOUS_SESSION_KEY = 'ytk_anonymous_session_id';

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
  console.log('[Anonymous Session] Session cleared');
}

/**
 * Check if user has an anonymous session
 */
export function hasAnonymousSession(): boolean {
  return !!localStorage.getItem(ANONYMOUS_SESSION_KEY);
}

/**
 * Get the current video count for anonymous users 
 * (this will be managed server-side but can be cached locally)
 */
export function getLocalAnonymousVideoCount(): number {
  const countStr = localStorage.getItem('ytk_anonymous_video_count');
  return countStr ? parseInt(countStr, 10) : 0;
}

/**
 * Update the local cache of anonymous video count
 * This is just a helper for the UI to show limits without server roundtrips
 */
export function setLocalAnonymousVideoCount(count: number): void {
  localStorage.setItem('ytk_anonymous_video_count', count.toString());
}

/**
 * Check if anonymous user has reached their video limit
 */
export function hasReachedAnonymousLimit(): boolean {
  const ANONYMOUS_VIDEO_LIMIT = 3; // Maximum videos per anonymous session
  return getLocalAnonymousVideoCount() >= ANONYMOUS_VIDEO_LIMIT;
}