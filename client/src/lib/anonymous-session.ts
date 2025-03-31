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
 * Clears the anonymous session data from localStorage and cookies
 * Used when logging in, registering, or after migration
 * 
 * The enhanced version ensures a complete cleanup and app state refresh
 * 
 * @param forceReload Optional boolean to trigger page reload after clearing (default: false)
 */
export function clearAnonymousSession(forceReload: boolean = false): void {
  console.log('[Anonymous Session] Thoroughly clearing all anonymous session data');
  
  // Clear browser storage
  // ------------------------
  
  // 1. Clear localStorage - first the known keys
  localStorage.removeItem(LOCAL_STORAGE_SESSION_KEY);
  
  // 2. Then look for and remove any pattern-matched anonymous session related data
  const keysToRemove: string[] = [];
  
  // Patterns to match against for thorough cleanup
  const localStoragePatterns = [
    'anon_', 'anonymous', 'session_id', 'sessionId', 'ytk_anon'
  ];
  
  // Scan localStorage for matching keys
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key) continue;
    
    // Check if the key matches any of our patterns
    if (localStoragePatterns.some(pattern => key.toLowerCase().includes(pattern))) {
      console.log('[Anonymous Session] Found additional anonymous session data in localStorage:', key);
      keysToRemove.push(key);
    }
  }
  
  // Remove all collected keys (doing it separately to avoid index shifting during removal)
  keysToRemove.forEach(key => {
    console.log('[Anonymous Session] Removing localStorage item:', key);
    localStorage.removeItem(key);
  });
  
  // Clear cookies
  // ------------------------
  
  // 1. Define all paths where cookies might have been set
  const paths = ['/', '/api', '/api/auth', '/api/anonymous', '/videos', ''];
  
  // 2. The known session cookie names
  const knownSessionCookies = [
    SESSION_COOKIE_NAME,
    ALT_SESSION_COOKIE_NAME,
    'anonymous_session',
    'x-anonymous-session'
  ];
  
  // 3. First clear the known cookie names on all paths
  knownSessionCookies.forEach(cookieName => {
    paths.forEach(path => {
      document.cookie = `${cookieName}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=${path}; SameSite=Lax`;
    });
  });
  
  // 4. Then scan for and clear any cookies containing anonymous session patterns
  const cookiePatterns = ['anon', 'anonymous', 'session'];
  const cookies = document.cookie.split(';');
  
  for (const cookie of cookies) {
    const [name] = cookie.trim().split('=');
    if (!name) continue;
    
    // Check if the cookie matches any of our patterns
    if (cookiePatterns.some(pattern => name.toLowerCase().includes(pattern))) {
      console.log('[Anonymous Session] Clearing pattern-matched cookie:', name);
      paths.forEach(path => {
        document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=${path}; SameSite=Lax`;
      });
    }
  }
  
  console.log('[Anonymous Session] All anonymous session storage cleared');
  
  // Verify clearing worked with API
  // ------------------------
  try {
    // Use no-cache headers to ensure we get a fresh response
    const verifyHeaders = new Headers({
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    });
    
    // Make a verification request after a short delay to allow for any async operations
    setTimeout(async () => {
      try {
        // Before verification, do another sweep for cookies - our most aggressive approach
        // This is especially important for eliminating duplicate or old session cookies
        const allCookies = document.cookie.split(';');
        console.log('[Anonymous Session] Verification phase - checking all cookies:', allCookies);
        
        // Scan for and clear ANY cookie that might be related to anonymous sessions
        for (const cookie of allCookies) {
          const [name] = cookie.trim().split('=');
          if (!name) continue;
          
          // If the cookie name includes any of these strings, remove it
          const suspiciousParts = ['anon', 'anonymous', 'session', 'ytk'];
          const isSuspicious = suspiciousParts.some(part => 
            name.toLowerCase().includes(part)
          );
          
          if (isSuspicious) {
            console.log('[Anonymous Session] Verification phase: removing suspicious cookie:', name);
            document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; SameSite=Lax`;
            document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/api; SameSite=Lax`;
          }
        }
        
        // Now make a verification API request with empty anonymous session headers
        const response = await fetch('/api/anonymous/videos/count', {
          headers: verifyHeaders,
          // Ensure browser doesn't use cached response
          cache: 'no-store' 
        });
        
        const data = await response.json();
        console.log('[Anonymous Session] Post-clearing API check:', data);
        
        // If we still have a count, something went wrong - force regenerate a new session
        if (data.count > 0) {
          console.warn('[Anonymous Session] Session data persisted after clearing! Forcing regeneration...');
          // This will trigger the generation of a brand new session ID next time it's needed
          localStorage.removeItem(LOCAL_STORAGE_SESSION_KEY);
          
          // More aggressive clearing of localStorage
          for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.toLowerCase().includes('anon')) {
              localStorage.removeItem(key);
            }
          }
        }
        
        // If requested, force a page reload to ensure clean state
        if (forceReload) {
          console.log('[Anonymous Session] Forcing page reload for clean state');
          // Use a more direct reload approach to ensure it happens
          window.location.href = '/';
        }
      } catch (error) {
        console.error('[Anonymous Session] Error during verification check:', error);
        // Still try to reload if that was requested
        if (forceReload) {
          window.location.reload();
        }
      }
    }, 500); // 500ms delay to ensure other operations complete first
  } catch (e) {
    console.error('[Anonymous Session] Error setting up verification check:', e);
    
    // Still attempt reload if requested, even if verification failed
    if (forceReload) {
      // Use window.location.href for a more definitive reload
      window.location.href = '/';
    }
  }
}

/**
 * Gets an existing anonymous session ID or creates a new one if none exists
 * @returns The session ID, either existing or newly created
 */
export async function getOrCreateAnonymousSessionId(): Promise<string> {
  // First check if we have a session ID in localStorage (more reliable than cookies)
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
  
  // If not in localStorage, check cookie as fallback
  const cookieSessionId = getAnonymousSessionId();
  if (cookieSessionId) {
    console.log('[Anonymous Session] Using existing session from cookie:', cookieSessionId);
    
    // Save it to localStorage for next time
    localStorage.setItem(LOCAL_STORAGE_SESSION_KEY, cookieSessionId);
    
    return cookieSessionId;
  }
  
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