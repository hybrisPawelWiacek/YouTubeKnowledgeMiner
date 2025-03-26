// Import needed authentication modules
import { useSupabase } from '@/hooks/use-supabase';
import { getOrCreateAnonymousSessionId, hasAnonymousSession } from './anonymous-session';

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

export async function apiRequest(
  method: string,
  url: string,
  data?: any,
  headers?: HeadersInit
): Promise<Response> {
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

  // Add auth header if user is authenticated
  // Only add the header when we have a valid session
  if (currentSession?.user) {
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
  } else {
    console.log('[API] No current session or user available for API call');
    
    // Handle anonymous user sessions
    if (!currentSession?.user && hasAnonymousSession()) {
      // User doesn't have an authenticated session but has an anonymous session
      const anonymousSessionId = getOrCreateAnonymousSessionId();
      console.log('[API] Using anonymous session:', anonymousSessionId);
      
      // Add anonymous session header
      (options.headers as Record<string, string>)['x-anonymous-session'] = anonymousSessionId;
      
      // Also send the standard user-id header for backward compatibility
      // This ensures older server code still works during the transition
      (options.headers as Record<string, string>)['x-user-id'] = '1';
    } else if (!currentSession?.user) {
      // First-time anonymous user, create a session
      const anonymousSessionId = getOrCreateAnonymousSessionId();
      console.log('[API] Created new anonymous session:', anonymousSessionId);
      
      // Add anonymous session header
      (options.headers as Record<string, string>)['x-anonymous-session'] = anonymousSessionId;
      
      // Also send the standard user-id header for backward compatibility
      (options.headers as Record<string, string>)['x-user-id'] = '1';
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
    return response;
  } catch (error) {
    console.error('API request failed:', error);
    throw error; // Re-throw the error to be handled by the caller
  }
}