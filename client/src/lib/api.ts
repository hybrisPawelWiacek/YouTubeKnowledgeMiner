// Import needed authentication modules
import { useSupabase } from '@/hooks/use-supabase';

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
    
    // Try to convert to a clean number regardless of format (strip any prefixes)
    // This ensures we always pass a valid number to the server
    let cleanUserId;
    
    if (userId === undefined) {
      cleanUserId = undefined;
    } else if (typeof userId === 'number') {
      cleanUserId = userId;
    } else {
      // Extract numbers from the string if it contains non-numeric characters
      const match = String(userId).match(/\d+/);
      cleanUserId = match ? parseInt(match[0], 10) : NaN;
      console.log('[API] Extracted numeric ID from string:', cleanUserId);
    }
    
    console.log('[API] Clean user ID for x-user-id header:', cleanUserId);
    
    if (cleanUserId !== undefined && !isNaN(cleanUserId)) {
      const headerValue = String(cleanUserId);
      (options.headers as Record<string, string>)['x-user-id'] = headerValue;
      console.log('[API] Setting x-user-id header to:', headerValue);
    } else {
      console.warn('[API] Unable to set x-user-id header - invalid user ID:', userId);
    }
  } else {
    console.log('[API] No current session or user available for API call');
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