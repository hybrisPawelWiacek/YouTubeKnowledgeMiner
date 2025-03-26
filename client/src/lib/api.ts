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
    // Get the user ID and ensure it's a number
    let userId = currentSession.user.id;
    
    // Convert to number if it's a string
    if (typeof userId === 'string') {
      // Remove any 'direct_' prefix if it exists (for backward compatibility)
      if (userId.startsWith('direct_')) {
        userId = userId.substring(7);
      }
      userId = Number(userId);
    }
    
    // Send the user ID if it's valid
    if (!isNaN(userId as number)) {
      (options.headers as Record<string, string>)['x-user-id'] = String(userId);
    } else {
      console.error('Invalid user ID found in session', userId);
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