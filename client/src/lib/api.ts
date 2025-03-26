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
    // Ensure user ID is sent as a number in string format
    const userId = currentSession.user.id;
    (options.headers as Record<string, string>)['x-user-id'] = typeof userId === 'number' ? 
      String(userId) : String(Number(userId));
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