import { useEffect, useState } from 'react';
import { useSupabase } from '@/hooks/use-supabase';
import { getOrCreateAnonymousSessionId, hasAnonymousSession } from '@/lib/anonymous-session';
import { SYSTEM } from '../../../shared/config';

export function useLibraryQueryHeaders() {
  const { user } = useSupabase();
  const [headers, setHeaders] = useState<HeadersInit>({});
  
  useEffect(() => {
    // Function to initialize headers
    async function initializeHeaders() {
      const newHeaders: HeadersInit = {};
      
      // If a userId is available, add it to the headers
      const userId = user?.id;
      console.log('[VideoInput] User ID for headers:', userId, 'type:', typeof userId);
      
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
            setHeaders({}); // Set empty headers if no valid ID
            return;
          }
        }
        
        newHeaders['x-user-id'] = headerValue;
        console.log('[VideoInput] Setting x-user-id header to:', headerValue);
      } else {
        console.log('[VideoInput] No authenticated user, using anonymous session');
        
        try {
          // Always get or create the anonymous session
          const hasSession = await hasAnonymousSession();
          const anonymousSessionId = await getOrCreateAnonymousSessionId();
          
          console.log('[VideoInput] Fetching video count with session:', { anonymousSessionId, hasSession });
          
          if (anonymousSessionId) {
            // Add anonymous session header
            newHeaders['x-anonymous-session'] = anonymousSessionId;
            
            // Use the anonymous user ID from system config
            newHeaders['x-user-id'] = String(SYSTEM.ANONYMOUS_USER_ID);
          }
        } catch (error) {
          console.error('[VideoInput] Error setting up anonymous session:', error);
        }
      }
      
      setHeaders(newHeaders);
    }
    
    // Call the async function
    initializeHeaders();
  }, [user]); // Re-run effect when user changes
  
  return headers;
}