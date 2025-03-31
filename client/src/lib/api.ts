// Import needed authentication modules
import { useSupabase } from '@/hooks/use-supabase';
import { getOrCreateAnonymousSessionId, hasAnonymousSession, getAnonymousSessionId } from './anonymous-session';

// Create a helper to get the current user session without hooks
// This is necessary because we can't use React hooks outside of components
let currentSession: any = null;

// Function to update the current session (to be called from components)
export function updateCurrentSession(session: any) {
  console.log(`[API] Updating current session, user ID: ${session?.user?.id}, email: ${session?.user?.email}`);
  console.log(`[API] Session authentication type: ${session?.user?.user_metadata?.direct_auth ? 'direct auth' : 'supabase'}`);
  
  // Save the full session
  currentSession = session;
  
  // Debug the stored session
  if (session && session.user) {
    console.log(`[API] Current session updated with user ID: ${session.user.id} (${typeof session.user.id})`);
  }
}

/**
 * Makes an API request to the backend
 * @param method HTTP method (GET, POST, PUT, DELETE, PATCH)
 * @param url API endpoint URL
 * @param data Optional request body data
 * @param headers Optional additional headers
 * @returns Parsed JSON response data, not a Response object
 */
export async function apiRequest<T = any>(
  method: string,
  url: string,
  data?: any,
  headers?: HeadersInit
): Promise<T> {
  console.log(`[API] ${method} request to ${url} starting`);
  console.log(`[API] Current headers:`, headers);
  
  const options: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    credentials: 'include',
  };

  // First check for auth token in localStorage which would indicate user is registered
  const authToken = localStorage.getItem('auth_token');
  
  if (authToken) {
    console.log('[API] Found auth token in localStorage, using it for authentication');
    
    // Add the Authorization header with the Bearer token
    (options.headers as Record<string, string>)['Authorization'] = `Bearer ${authToken}`;
    
    // If the token is our custom format, we can extract the user ID
    if (authToken.startsWith('auth_token_')) {
      try {
        const parts = authToken.split('_');
        if (parts.length >= 3) {
          const userId = parseInt(parts[2], 10);
          if (!isNaN(userId)) {
            console.log('[API] Extracted user ID from auth token:', userId);
            (options.headers as Record<string, string>)['x-user-id'] = String(userId);
          }
        }
      } catch (err) {
        console.error('[API] Error extracting user ID from auth token:', err);
      }
    }
    
    // Don't use anonymous session if we have an auth token
    console.log('[API] Using authenticated session - skipping anonymous session header');
  }
  // If no auth token in localStorage but we have a currentSession
  else if (currentSession?.user) {
    console.log('[API] Current session details:');
    console.log(`- User ID: ${currentSession.user.id} (${typeof currentSession.user.id})`);
    console.log(`- User Email: ${currentSession.user.email}`);
    console.log(`- Auth Type: ${currentSession.user.user_metadata?.direct_auth ? 'direct' : 'supabase'}`);
    
    // Extract the numeric user ID and ensure it's sent as a number
    const userId = currentSession.user.id;
    
    // Log the user ID for debugging
    console.log('[API] Current user ID in API call:', userId, 'type:', typeof userId);
    
    // Ensure we always pass a valid numeric user ID to the server
    let cleanUserId;
    
    if (userId === undefined) {
      cleanUserId = undefined;
    } else if (typeof userId === 'number') {
      // If it's already a number, use it directly
      cleanUserId = userId;
    } else {
      // For anything else, convert to string first, then extract only numeric part
      const numericMatch = String(userId).match(/(\d+)/);
      if (numericMatch) {
        cleanUserId = parseInt(numericMatch[1], 10);
        console.log('[API] Extracted numeric ID from string/mixed value:', cleanUserId);
      } else {
        // If no numeric part was found, try direct conversion
        cleanUserId = Number(userId);
        if (isNaN(cleanUserId)) {
          console.error('[API] Failed to extract valid numeric ID from:', userId);
          cleanUserId = undefined;
        }
      }
    }
    
    console.log('[API] Clean user ID for x-user-id header:', cleanUserId, 'type:', typeof cleanUserId);
    
    // Only set the header if we have a valid positive user ID
    if (cleanUserId !== undefined && !isNaN(cleanUserId) && cleanUserId > 0) {
      // Always send as string in the header
      const headerValue = String(cleanUserId);
      (options.headers as Record<string, string>)['x-user-id'] = headerValue;
      console.log('[API] Setting x-user-id header to:', headerValue);
    } else {
      console.warn('[API] Unable to set x-user-id header - invalid user ID:', userId);
    }
  } 
  // Only use anonymous session if we have no auth token and no user session
  else {
    console.log('[API] No auth token or user session found - checking for anonymous session');
    
    try {
      // Get or create an anonymous session ID - ensuring we await the Promise
      const anonymousSessionId = await getOrCreateAnonymousSessionId();
      
      // Safety check in case the session is null
      if (anonymousSessionId) {
        console.log('[API] Using anonymous session:', anonymousSessionId);
        
        // Add anonymous session header
        (options.headers as Record<string, string>)['x-anonymous-session'] = anonymousSessionId;
        
        // Log the headers being sent
        console.log('[API] Request headers for anonymous user:', options.headers);
      } else {
        console.warn('[API] Failed to get a valid anonymous session ID');
      }
    } catch (err) {
      console.error('[API] Error getting anonymous session ID:', err);
    }
  }

  if (data) {
    options.body = JSON.stringify(data);
  }

  try {
    const response = await fetch(url, options);
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || response.statusText);
    }
    
    // Parse and return the JSON data from the response
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('API request failed:', error);
    throw error; // Re-throw the error to be handled by the caller
  }
}