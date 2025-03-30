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
  
  // For our MVP implementation, we'll use a client-side generated ID
  // rather than making an API call that doesn't exist yet
  const fallbackId = `anon_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
  
  // Store it in a cookie for persistence
  const expirationDate = new Date();
  expirationDate.setDate(expirationDate.getDate() + 30); // 30 days expiration
  document.cookie = `${SESSION_COOKIE_NAME}=${fallbackId}; expires=${expirationDate.toUTCString()}; path=/; SameSite=Lax`;
  
  console.log('[Anonymous Session] Created new client-side session:', fallbackId);
  return fallbackId;
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
    // For development/MVP, we'll use localStorage to track video count
    // In a real implementation, this would call the backend API
    const countStr = localStorage.getItem('anonymous_video_count') || '0';
    const count = parseInt(countStr, 10);
    
    // Log for debugging
    console.log('[Anonymous Session] Video count from localStorage:', count);
    
    return {
      count,
      maxAllowed: 3 // Hardcoded limit for anonymous users
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
 * @returns The new count after incrementing
 */
export function incrementAnonymousVideoCount(): number {
  // Get current count
  const countStr = localStorage.getItem('anonymous_video_count') || '0';
  const currentCount = parseInt(countStr, 10);
  
  // Increment
  const newCount = currentCount + 1;
  
  // Save back to localStorage
  localStorage.setItem('anonymous_video_count', newCount.toString());
  
  console.log('[Anonymous Session] Incremented video count to:', newCount);
  
  return newCount;
}