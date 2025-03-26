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
    // Extract the numeric user ID and ensure it's sent as a number
    const userId = currentSession.user.id;
    
    // Log the user ID for debugging
    console.log('Current user ID in API call:', userId, 'type:', typeof userId);
    
    // Try to convert to a clean number regardless of format (strip any prefixes)
    // This ensures we always pass a valid number to the server
    const cleanUserId = userId === undefined ? undefined : 
                        (typeof userId === 'number' ? userId : 
                         Number(String(userId).replace(/\D/g, '')));
    
    console.log('Clean user ID for x-user-id header:', cleanUserId);
    
    if (cleanUserId !== undefined && !isNaN(cleanUserId)) {
      (options.headers as Record<string, string>)['x-user-id'] = String(cleanUserId);
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