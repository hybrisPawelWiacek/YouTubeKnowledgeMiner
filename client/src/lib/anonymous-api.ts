/**
 * Enhanced API utilities for anonymous session handling
 * 
 * This module provides robust error handling for anonymous session API operations
 * with better error feedback and recovery options.
 */

import { getOrCreateAnonymousSessionId } from './anonymous-session';
import { SYSTEM } from './system-config';

// Error codes specific to anonymous users
export enum AnonymousErrorCode {
  SESSION_EXPIRED = 'SESSION_EXPIRED',
  SESSION_REQUIRED = 'SESSION_REQUIRED',
  LIMIT_REACHED = 'ANONYMOUS_LIMIT_REACHED',
  NETWORK_ERROR = 'NETWORK_ERROR',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR'
}

// Standard error response format
interface ErrorResponse {
  message: string;
  code?: string;
  details?: string;
}

/**
 * Custom error class for anonymous session errors
 * Provides consistent error format and type information
 */
export class AnonymousSessionError extends Error {
  code: string;
  details?: string;
  status?: number;

  constructor(message: string, code: string = AnonymousErrorCode.UNKNOWN_ERROR, details?: string, status?: number) {
    super(message);
    this.name = 'AnonymousSessionError';
    this.code = code;
    this.details = details;
    this.status = status;
  }
}

/**
 * Make an API request with anonymous session handling and enhanced error handling
 * 
 * @param url API endpoint URL
 * @param options Fetch options
 * @returns Promise with typed response data
 */
export async function anonymousFetch<T = any>(
  url: string,
  options: RequestInit = {}
): Promise<T> {
  try {
    // Use await to ensure we get a string, not a Promise
    const sessionId = await getOrCreateAnonymousSessionId();
    const headers = new Headers(options.headers || {});
    
    if (sessionId) {
      headers.set('x-anonymous-session', sessionId);
      
      // Also add the anonymous user ID when we have a session
      headers.set('x-user-id', String(SYSTEM.ANONYMOUS_USER_ID));
      
      console.log(`[Anonymous API] Added anonymous session headers:`, {
        'x-anonymous-session': sessionId,
        'x-user-id': String(SYSTEM.ANONYMOUS_USER_ID)
      });
    }
    
    // Log the request for debugging
    console.log(`[Anonymous API] ${options.method || 'GET'} request to ${url}`);
    
    // Make the request
    const response = await fetch(url, {
      ...options,
      headers,
      credentials: 'include'
    });
    
    // Handle non-OK responses
    if (!response.ok) {
      let errorData: ErrorResponse = {
        message: response.statusText || 'An unknown error occurred'
      };
      
      try {
        // Try to parse error response as JSON
        errorData = await response.json();
      } catch (e) {
        // If parsing fails, use status text or default message
        console.warn('[Anonymous API] Failed to parse error response:', e);
      }
      
      // Determine appropriate error code based on response
      let errorCode = errorData.code || AnonymousErrorCode.UNKNOWN_ERROR;
      
      // Map HTTP status codes to our error codes if no specific code provided
      if (!errorData.code) {
        switch (response.status) {
          case 401:
            errorCode = AnonymousErrorCode.SESSION_REQUIRED;
            break;
          case 403:
            errorCode = AnonymousErrorCode.LIMIT_REACHED;
            break;
          case 429:
            errorCode = AnonymousErrorCode.LIMIT_REACHED;
            break;
        }
      }
      
      // Throw standardized error
      throw new AnonymousSessionError(
        errorData.message || 'Request failed',
        errorCode,
        errorData.details,
        response.status
      );
    }
    
    // Parse successful response
    const data = await response.json();
    return data as T;
  } catch (error) {
    // Handle network errors and other exceptions
    if (!(error instanceof AnonymousSessionError)) {
      // Wrap other errors in our error class
      const message = error instanceof Error ? error.message : 'Network error occurred';
      
      // Determine if this is a network error
      const isNetworkError = error instanceof TypeError && 
        (error.message.includes('network') || error.message.includes('fetch'));
      
      const errorCode = isNetworkError 
        ? AnonymousErrorCode.NETWORK_ERROR 
        : AnonymousErrorCode.UNKNOWN_ERROR;
      
      throw new AnonymousSessionError(message, errorCode);
    }
    
    // Re-throw AnonymousSessionError instances
    throw error;
  }
}

/**
 * Get the number of videos in anonymous session
 * With enhanced error handling
 */
export async function getAnonymousVideoCount(): Promise<{ count: number; maxAllowed: number }> {
  try {
    const response = await anonymousFetch<{ count: number; max_allowed: number; session_id?: string }>('/api/anonymous/videos/count');
    
    // Transform the response to match our expected format
    return { 
      count: response.count, 
      maxAllowed: response.max_allowed || SYSTEM.ANONYMOUS_VIDEO_LIMIT  // Default to system limit if not provided
    };
  } catch (error) {
    console.error('[Anonymous API] Error getting video count:', error);
    
    if (error instanceof AnonymousSessionError) {
      throw error;
    }
    
    // Default values in case of error
    return { count: 0, maxAllowed: SYSTEM.ANONYMOUS_VIDEO_LIMIT };
  }
}

/**
 * Check if anonymous user has reached their video limit
 * With reliable error handling
 */
export async function hasReachedAnonymousLimit(): Promise<boolean> {
  try {
    const { count, maxAllowed } = await getAnonymousVideoCount();
    return count >= maxAllowed;
  } catch (error) {
    console.error('[Anonymous API] Error checking limit:', error);
    
    // If we get a LIMIT_REACHED error code, we know the limit is reached
    if (error instanceof AnonymousSessionError && 
        error.code === AnonymousErrorCode.LIMIT_REACHED) {
      return true;
    }
    
    // For other errors, assume they haven't reached the limit to avoid blocking unnecessarily
    return false;
  }
}