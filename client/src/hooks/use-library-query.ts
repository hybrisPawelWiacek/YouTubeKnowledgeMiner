import { useSupabase } from '@/hooks/use-supabase';
import { getOrCreateAnonymousSessionId, hasAnonymousSession } from '@/lib/anonymous-session';

export function useLibraryQueryHeaders() {
  const { user } = useSupabase();
  
  // Initialize headers
  const headers: HeadersInit = {};
  
  // If a userId is available, add it to the headers
  const userId = user?.id;
  console.log('use-library-query trying to set x-user-id header with user ID:', userId, 'type:', typeof userId);
  
  if (userId) {
    let headerValue;
    
    // Ensure userId is sent as a clean number in string format
    if (typeof userId === 'number') {
      headerValue = String(userId);
    } else {
      // For strings or other types, extract numeric portion if possible
      const match = String(userId).match(/\d+/);
      const extractedId = match ? parseInt(match[0], 10) : NaN;
      console.log('Extracted numeric user ID from string:', extractedId);
      
      if (!isNaN(extractedId)) {
        headerValue = String(extractedId);
      } else {
        console.warn('Failed to extract valid user ID from:', userId);
        return {}; // Return empty headers if no valid ID
      }
    }
    
    headers['x-user-id'] = headerValue;
    console.log('Setting x-user-id header in library query to:', headerValue);
  } else {
    console.log('No authenticated user found, checking for anonymous session');
    
    // If no authenticated user, handle anonymous session
    if (hasAnonymousSession()) {
      const anonymousSessionId = getOrCreateAnonymousSessionId();
      console.log('Using anonymous session ID for library query:', anonymousSessionId);
      
      // Add anonymous session header
      headers['x-anonymous-session'] = anonymousSessionId;
      
      // Also add default user ID for backward compatibility
      headers['x-user-id'] = '1';
    } else {
      console.log('Creating new anonymous session for library query');
      
      // Create new anonymous session
      const anonymousSessionId = getOrCreateAnonymousSessionId();
      
      // Add anonymous session header
      headers['x-anonymous-session'] = anonymousSessionId;
      
      // Also add default user ID for backward compatibility
      headers['x-user-id'] = '1';
    }
  }
  
  return headers;
}