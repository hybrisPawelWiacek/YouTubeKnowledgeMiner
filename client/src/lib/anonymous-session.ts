/**
 * Anonymous Session Management Utilities
 * 
 * This module provides utilities for working with anonymous sessions including:
 * - Getting the current anonymous session ID
 * - Checking video counts and limits
 * - Managing session cookies
 */

import axios from 'axios';
import { SYSTEM } from './system-config';

// Anonymous session cookie name
const SESSION_COOKIE_NAME = 'anonymousSessionId';
// Also check for the alternate cookie name used by the server
const ALT_SESSION_COOKIE_NAME = 'anonymous_session_id';
// Local storage key for anonymous session
const LOCAL_STORAGE_SESSION_KEY = 'ytk_anon_session_id';

/**
 * Generates a new anonymous session ID with proper format
 * Format: anon_[timestamp]_[random]
 * @returns A new unique session ID string
 */
export function generateSessionId(): string {
  const timestamp = Date.now();
  const randomPart = Math.random().toString(36).substring(2, 10);
  return `${SYSTEM.ANONYMOUS_SESSION_PREFIX}${timestamp}_${randomPart}`;
}

/**
 * Get the current anonymous session ID from cookies
 * @returns The session ID if available, null otherwise
 */
export function getAnonymousSessionId(): string | null {
  const cookies = document.cookie.split(';');
  
  console.log('[Anonymous Session] All cookies:', document.cookie);
  
  for (const cookie of cookies) {
    const [name, value] = cookie.trim().split('=');
    console.log('[Anonymous Session] Checking cookie:', { name, value });
    
    // Check both cookie names used in the application
    if (name === SESSION_COOKIE_NAME || name === ALT_SESSION_COOKIE_NAME) {
      console.log('[Anonymous Session] Found session cookie with value:', value);
      return value;
    }
  }
  
  console.log('[Anonymous Session] No session cookie found with names:', SESSION_COOKIE_NAME, 'or', ALT_SESSION_COOKIE_NAME);
  return null;
}

/**
 * Clear all anonymous session data from cookies and localStorage
 * Call this during registration/login or migration to ensure clean state
 * 
 * @param forceReload Optional boolean to trigger page reload after clearing (default: false)
 */
export function clearAnonymousSession(forceReload: boolean = false): void {
  console.log('[Anonymous Session] Thoroughly clearing all anonymous session data');
  
  // Clear browser storage
  // ------------------------
  
  // 1. Clear localStorage - first the known keys
  localStorage.removeItem(LOCAL_STORAGE_SESSION_KEY);
  
  // 2. Clear fallback keys that might be leftover from older versions
  localStorage.removeItem('anonymousSessionId');
  localStorage.removeItem('anonymous_session_id');
  
  // 3. Any other app-specific state related to anonymous mode
  localStorage.removeItem('anonymousViews');
  localStorage.removeItem('anonymous_video_count');
  
  // Clear cookies
  // ------------------------
  
  // 1. Clear the main anonymous session cookie
  document.cookie = `${SESSION_COOKIE_NAME}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; SameSite=Lax`;
  
  // 2. Clear the alternate cookie name used by the server
  document.cookie = `${ALT_SESSION_COOKIE_NAME}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; SameSite=Lax`;
  
  // 3. Also try to clear cookies with the domain attribute (needed in some environments)
  const domain = window.location.hostname;
  if (domain) {
    document.cookie = `${SESSION_COOKIE_NAME}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; domain=${domain}; SameSite=Lax`;
    document.cookie = `${ALT_SESSION_COOKIE_NAME}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; domain=${domain}; SameSite=Lax`;
  }
  
  // 4. For extra safety, also try to set with null value
  document.cookie = `${SESSION_COOKIE_NAME}=null; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; SameSite=Lax`;
  document.cookie = `${ALT_SESSION_COOKIE_NAME}=null; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; SameSite=Lax`;
  
  console.log('[Anonymous Session] Session data cleared - cookies after clearing:', document.cookie);
  
  // For some scenarios, we might want to force a page reload to ensure a clean state
  if (forceReload) {
    console.log('[Anonymous Session] Forcing page reload for clean state');
    window.location.reload();
  }
}

/**
 * Gets an existing anonymous session ID or creates a new one if none exists
 * @returns The session ID, either existing or newly created, or null if authenticated
 */
export async function getOrCreateAnonymousSessionId(): Promise<string | null> {
  // PRIORITY 1: Check if user is authenticated - if so, don't use/create anonymous session
  const authToken = localStorage.getItem('auth_token');
  if (authToken) {
    console.log('[Anonymous Session] User is authenticated - not using anonymous session');
    // Clear any existing anonymous session data since we're now authenticated
    clearAnonymousSession();
    return null;
  }
  
  // PRIORITY 2: Check if we have a session ID in localStorage (more reliable than cookies)
  const storedSessionId = localStorage.getItem(LOCAL_STORAGE_SESSION_KEY);
  if (storedSessionId) {
    console.log('[Anonymous Session] Using existing session from localStorage:', storedSessionId);
    
    // Also ensure it's in both cookie formats for compatibility
    const expirationDate = new Date();
    expirationDate.setDate(expirationDate.getDate() + 30);
    document.cookie = `${SESSION_COOKIE_NAME}=${storedSessionId}; expires=${expirationDate.toUTCString()}; path=/; SameSite=Lax`;
    document.cookie = `${ALT_SESSION_COOKIE_NAME}=${storedSessionId}; expires=${expirationDate.toUTCString()}; path=/; SameSite=Lax`;
    
    return storedSessionId;
  }
  
  // PRIORITY 3: If not in localStorage, check cookie as fallback
  const cookieSessionId = getAnonymousSessionId();
  if (cookieSessionId) {
    console.log('[Anonymous Session] Using existing session from cookie:', cookieSessionId);
    
    // Save it to localStorage for next time
    localStorage.setItem(LOCAL_STORAGE_SESSION_KEY, cookieSessionId);
    
    return cookieSessionId;
  }
  
  // PRIORITY 4: If no existing session found, create a new one
  try {
    // Generate a new session ID using our consistent function
    const newSessionId = generateSessionId();
    
    // Store it in localStorage
    localStorage.setItem(LOCAL_STORAGE_SESSION_KEY, newSessionId);
    
    // Also store in both cookie formats for compatibility
    const expirationDate = new Date();
    expirationDate.setDate(expirationDate.getDate() + 30); // 30 days expiration
    document.cookie = `${SESSION_COOKIE_NAME}=${newSessionId}; expires=${expirationDate.toUTCString()}; path=/; SameSite=Lax`;
    document.cookie = `${ALT_SESSION_COOKIE_NAME}=${newSessionId}; expires=${expirationDate.toUTCString()}; path=/; SameSite=Lax`;
    
    // Initialize this session in the backend
    await axios.get('/api/anonymous/videos/count', {
      headers: {
        'x-anonymous-session': newSessionId
      }
    });
    
    console.log('[Anonymous Session] Created new session:', newSessionId);
    return newSessionId;
  } catch (error) {
    console.error('[Anonymous Session] Error creating session:', error);
    
    // Fallback to client-side only if there's an error
    const fallbackId = generateSessionId();
    
    // Store in localStorage
    localStorage.setItem(LOCAL_STORAGE_SESSION_KEY, fallbackId);
    
    // And in both cookie formats
    document.cookie = `${SESSION_COOKIE_NAME}=${fallbackId}; expires=${new Date(Date.now() + 30*24*60*60*1000).toUTCString()}; path=/; SameSite=Lax`;
    document.cookie = `${ALT_SESSION_COOKIE_NAME}=${fallbackId}; expires=${new Date(Date.now() + 30*24*60*60*1000).toUTCString()}; path=/; SameSite=Lax`;
    
    console.log('[Anonymous Session] Created fallback session due to error:', fallbackId);
    return fallbackId;
  }
}

/**
 * Prepares headers with the anonymous session ID for API requests
 * Use this helper function to get headers with the anonymous session included
 * 
 * @param existingHeaders Optional existing headers to extend
 * @returns A promise that resolves to HeadersInit object with the anonymous session included
 */
export async function getAnonymousSessionHeaders(existingHeaders: HeadersInit = {}): Promise<Record<string, string>> {
  // Create a copy of the existing headers as a Record<string, string> to ensure type safety
  const headers: Record<string, string> = { 
    ...(typeof existingHeaders === 'object' ? existingHeaders as Record<string, string> : {})
  };
  
  // Get the anonymous session ID
  const sessionId = await getOrCreateAnonymousSessionId();
  
  // Add it to the headers
  if (sessionId) {
    headers['x-anonymous-session'] = sessionId;
  }
  
  return headers;
}

/**
 * Interface for video count information 
 */
interface VideoCountInfo {
  count: number;
  maxAllowed: number;
}

/**
 * Get information about anonymous video count and limits
 * @returns Object with video count and max allowed videos
 */
export async function getAnonymousVideoCountInfo(): Promise<VideoCountInfo> {
  try {
    // Get the session ID from our reliable function that checks both localStorage and cookies
    const sessionId = await getOrCreateAnonymousSessionId();
    
    if (!sessionId) {
      console.log('[Anonymous Session] No session found, returning default values');
      return { count: 0, maxAllowed: SYSTEM.ANONYMOUS_VIDEO_LIMIT };
    }
    
    // Call the backend API to get the actual count
    const response = await axios.get('/api/anonymous/videos/count', {
      headers: {
        'x-anonymous-session': sessionId
      }
    });
    
    // Log for debugging
    console.log('[Anonymous Session] Video count from API:', response.data);
    
    return {
      count: response.data.count || 0,
      maxAllowed: response.data.max_allowed || SYSTEM.ANONYMOUS_VIDEO_LIMIT
    };
  } catch (error) {
    console.error('Error getting anonymous video count:', error);
    // Default values if something goes wrong
    return {
      count: 0,
      maxAllowed: SYSTEM.ANONYMOUS_VIDEO_LIMIT
    };
  }
}

/**
 * Check if the user has reached the anonymous video limit
 * @returns True if limit reached, false otherwise
 */
export async function hasReachedAnonymousLimit(): Promise<boolean> {
  try {
    const { count, maxAllowed } = await getAnonymousVideoCountInfo();
    return count >= maxAllowed;
  } catch (error) {
    console.error('Error checking anonymous limit:', error);
    return false;
  }
}

/**
 * Check if authentication prompts should be suppressed based on user preference
 * @returns True if prompts should be suppressed, false otherwise
 */
export function shouldSuppressAuthPrompts(): boolean {
  const suppressUntil = localStorage.getItem('suppress_auth_prompts_until');
  
  if (suppressUntil) {
    const suppressUntilTime = parseInt(suppressUntil, 10);
    return Date.now() < suppressUntilTime;
  }
  
  return false;
}

/**
 * Check if the user has an anonymous session
 * @returns True if an anonymous session exists, false otherwise
 */
export function hasAnonymousSession(): boolean {
  // Don't report anonymous session if authenticated
  const authToken = localStorage.getItem('auth_token');
  if (authToken) {
    return false;
  }

  // Check localStorage first (more reliable)
  const storedSessionId = localStorage.getItem(LOCAL_STORAGE_SESSION_KEY);
  if (storedSessionId) {
    return true;
  }
  
  // Fallback to cookie check
  const cookieSessionId = getAnonymousSessionId();
  return !!cookieSessionId;
}

/**
 * Increment the anonymous video count when a new video is analyzed
 * Note: The backend automatically increments the count when videos are added,
 * this function is maintained for backward compatibility with existing code
 * @returns The new count (after API fetch)
 */
export async function incrementAnonymousVideoCount(): Promise<number> {
  try {
    // Get updated count from the backend
    const { count } = await getAnonymousVideoCountInfo();
    
    console.log('[Anonymous Session] Current video count from API:', count);
    
    return count;
  } catch (error) {
    console.error('Error incrementing anonymous video count:', error);
    return 0;
  }
}