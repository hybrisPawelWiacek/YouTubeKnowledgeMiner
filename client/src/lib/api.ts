// Import needed authentication modules
import { useSupabase } from '@/hooks/use-supabase';

// Create a helper to get the current user session without hooks
// This is necessary because we can't use React hooks outside of components
let currentSession: any = null;

// Function to update the current session (to be called from components)
export function updateCurrentSession(session: any) {
  currentSession = session;
}

export async function apiRequest(
  method: string,
  url: string,
  data?: any,
  headers?: HeadersInit
): Promise<Response> {
  const options: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    credentials: 'include',
  };

  // Add auth header if user is authenticated
  if (currentSession?.user) {
    console.log('Current session:', JSON.stringify(currentSession));
    // Extract the numeric user ID and ensure it's sent as a number
    const userId = currentSession.user.id;
    
    // Log the user ID for debugging
    console.log('Current user ID in API call:', userId, 'type:', typeof userId);
    
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
      console.log('Extracted numeric ID from string:', cleanUserId);
    }
    
    console.log('Clean user ID for x-user-id header:', cleanUserId);
    
    if (cleanUserId !== undefined && !isNaN(cleanUserId)) {
      const headerValue = String(cleanUserId);
      (options.headers as Record<string, string>)['x-user-id'] = headerValue;
      console.log('Setting x-user-id header to:', headerValue);
    } else {
      console.warn('Unable to set x-user-id header - invalid user ID:', userId);
    }
  } else {
    console.log('No current session or user available for API call');
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