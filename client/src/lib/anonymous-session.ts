/**
 * Anonymous Session Management Utilities
 * 
 * This module provides utilities for working with anonymous sessions including:
 * - Getting the current anonymous session ID
 * - Checking video counts and limits
 * - Managing session cookies
 */

import axios from 'axios';

// Anonymous session cookie name
const SESSION_COOKIE_NAME = 'anonymous_session_id';

/**
 * Get the current anonymous session ID from cookies
 * @returns The session ID if available, null otherwise
 */
export async function getAnonymousSessionId(): Promise<string | null> {
  const cookies = document.cookie.split(';');
  
  for (const cookie of cookies) {
    const [name, value] = cookie.trim().split('=');
    if (name === SESSION_COOKIE_NAME) {
      return value;
    }
  }
  
  return null;
}

/**
 * Gets an existing anonymous session ID or creates a new one if none exists
 * @returns The session ID, either existing or newly created
 */
export async function getOrCreateAnonymousSessionId(): Promise<string> {
  // First check if we already have a session ID
  const existingId = await getAnonymousSessionId();
  if (existingId) {
    console.log('[Anonymous Session] Using existing session:', existingId);
    return existingId;
  }
  
  try {
    // Generate a new session ID format that matches what the backend expects
    const newSessionId = `anon_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
    
    // Store it in a cookie for persistence
    const expirationDate = new Date();
    expirationDate.setDate(expirationDate.getDate() + 30); // 30 days expiration
    document.cookie = `${SESSION_COOKIE_NAME}=${newSessionId}; expires=${expirationDate.toUTCString()}; path=/; SameSite=Lax`;
    
    // Also make a request to the backend to initialize this session
    // We do this by simply using the session ID in a request to the count endpoint
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
    const fallbackId = `anon_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
    document.cookie = `${SESSION_COOKIE_NAME}=${fallbackId}; expires=${new Date(Date.now() + 30*24*60*60*1000).toUTCString()}; path=/; SameSite=Lax`;
    
    console.log('[Anonymous Session] Created fallback session due to error:', fallbackId);
    return fallbackId;
  }
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
    // Get the current session ID
    const sessionId = await getAnonymousSessionId();
    
    if (!sessionId) {
      console.log('[Anonymous Session] No session found, returning default values');
      return { count: 0, maxAllowed: 3 };
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
      maxAllowed: response.data.max_allowed || 3
    };
  } catch (error) {
    console.error('Error getting anonymous video count:', error);
    // Default values if something goes wrong
    return {
      count: 0,
      maxAllowed: 3
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
  const sessionId = await getAnonymousSessionId();
  return !!sessionId;
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