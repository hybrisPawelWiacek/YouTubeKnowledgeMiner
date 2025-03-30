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
  
  // If no session exists, create a new one
  try {
    const response = await axios.post('/api/anonymous/session');
    const sessionId = response.data.sessionId;
    
    // The API should set the cookie, but we'll log confirmation
    console.log('[Anonymous Session] Created new session:', sessionId);
    return sessionId;
  } catch (error) {
    console.error('[Anonymous Session] Failed to create session:', error);
    // Generate a fallback local session ID in case of API failure
    const fallbackId = `anon_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
    console.log('[Anonymous Session] Using fallback session ID:', fallbackId);
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
    const response = await axios.get('/api/anonymous/videos/count');
    return response.data;
  } catch (error) {
    console.error('Error getting anonymous video count:', error);
    // Default values if the request fails
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