/**
 * Anonymous Session Management Utilities
 * 
 * This module provides utilities for working with anonymous sessions including:
 * - Getting the current anonymous session ID
 * - Checking video counts and limits
 * - Managing session cookies
 */

import axios from 'axios';
import { SYSTEM } from '../../../shared/config';

// Anonymous session cookie name
const SESSION_COOKIE_NAME = 'anonymousSessionId';

/**
 * Get the current anonymous session ID from cookies
 * @returns The session ID if available, null otherwise
 */
export async function getAnonymousSessionId(): Promise<string | null> {
  const cookies = document.cookie.split(';');
  
  console.log('[Anonymous Session] All cookies:', document.cookie);
  
  for (const cookie of cookies) {
    const [name, value] = cookie.trim().split('=');
    console.log('[Anonymous Session] Checking cookie:', { name, value });
    if (name === SESSION_COOKIE_NAME) {
      console.log('[Anonymous Session] Found session cookie with value:', value);
      return value;
    }
  }
  
  console.log('[Anonymous Session] No session cookie found with name:', SESSION_COOKIE_NAME);
  return null;
}

/**
 * Gets an existing anonymous session ID or creates a new one if none exists
 * @returns The session ID, either existing or newly created
 */
// Local storage key for anonymous session
const LOCAL_STORAGE_SESSION_KEY = 'ytk_anon_session_id';

/**
 * Clears the anonymous session data from localStorage and cookies
 * Used when logging in, registering, or after migration
 */
export function clearAnonymousSession(): void {
  console.log('[Anonymous Session] Clearing anonymous session data');
  // Remove from localStorage
  localStorage.removeItem(LOCAL_STORAGE_SESSION_KEY);
  
  // Remove from cookie by setting an expired date
  document.cookie = `${SESSION_COOKIE_NAME}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; SameSite=Lax`;
  
  console.log('[Anonymous Session] Anonymous session cleared successfully');
}

export async function getOrCreateAnonymousSessionId(): Promise<string> {
  // First check if we have a session ID in localStorage (more reliable than cookies)
  const storedSessionId = localStorage.getItem(LOCAL_STORAGE_SESSION_KEY);
  if (storedSessionId) {
    console.log('[Anonymous Session] Using existing session from localStorage:', storedSessionId);
    
    // Also ensure it's in the cookie for backwards compatibility
    const expirationDate = new Date();
    expirationDate.setDate(expirationDate.getDate() + 30);
    document.cookie = `${SESSION_COOKIE_NAME}=${storedSessionId}; expires=${expirationDate.toUTCString()}; path=/; SameSite=Lax`;
    
    return storedSessionId;
  }
  
  // If not in localStorage, check cookie as fallback
  const cookieSessionId = await getAnonymousSessionId();
  if (cookieSessionId) {
    console.log('[Anonymous Session] Using existing session from cookie:', cookieSessionId);
    
    // Save it to localStorage for next time
    localStorage.setItem(LOCAL_STORAGE_SESSION_KEY, cookieSessionId);
    
    return cookieSessionId;
  }
  
  try {
    // Generate a new session ID format that matches what the backend expects
    const newSessionId = `${SYSTEM.ANONYMOUS_SESSION_PREFIX}${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
    
    // Store it in localStorage
    localStorage.setItem(LOCAL_STORAGE_SESSION_KEY, newSessionId);
    
    // Also store in a cookie for compatibility
    const expirationDate = new Date();
    expirationDate.setDate(expirationDate.getDate() + 30); // 30 days expiration
    document.cookie = `${SESSION_COOKIE_NAME}=${newSessionId}; expires=${expirationDate.toUTCString()}; path=/; SameSite=Lax`;
    
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
    const fallbackId = `${SYSTEM.ANONYMOUS_SESSION_PREFIX}${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
    
    // Store in localStorage
    localStorage.setItem(LOCAL_STORAGE_SESSION_KEY, fallbackId);
    
    // And in cookie
    document.cookie = `${SESSION_COOKIE_NAME}=${fallbackId}; expires=${new Date(Date.now() + 30*24*60*60*1000).toUTCString()}; path=/; SameSite=Lax`;
    
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
export async function hasAnonymousSession(): Promise<boolean> {
  // Check localStorage first (more reliable)
  const storedSessionId = localStorage.getItem(LOCAL_STORAGE_SESSION_KEY);
  if (storedSessionId) {
    return true;
  }
  
  // Fallback to cookie check
  const cookieSessionId = await getAnonymousSessionId();
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