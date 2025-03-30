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
      console.log('[LibraryQuery] User ID for headers:', userId, 'type:', typeof userId);
      
      if (userId) {
        // Authenticated user path
        let headerValue;
        
        // Ensure userId is sent as a clean number in string format
        if (typeof userId === 'number') {
          headerValue = String(userId);
        } else {
          // For strings or other types, extract numeric portion if possible
          const match = String(userId).match(/\d+/);
          const extractedId = match ? parseInt(match[0], 10) : NaN;
          console.log('[LibraryQuery] Extracted numeric user ID from string:', extractedId);
          
          if (!isNaN(extractedId)) {
            headerValue = String(extractedId);
          } else {
            console.warn('[LibraryQuery] Failed to extract valid user ID from:', userId);
            setHeaders({}); // Set empty headers if no valid ID
            return;
          }
        }
        
        newHeaders['x-user-id'] = headerValue;
        console.log('[LibraryQuery] Setting x-user-id header for authenticated user:', headerValue);
      } else {
        // Anonymous user path
        console.log('[LibraryQuery] No authenticated user, using anonymous session');
        
        try {
          // First check if user already has an anonymous session
          // hasAnonymousSession is synchronous, no need to await
          const hasSessionResult = hasAnonymousSession();
          
          // Get session ID (or create a new one if needed)
          // Use await here to ensure we get a string, not a Promise
          let anonymousSessionId = null;
          try {
            // Make sure to await the result to get the actual string value
            anonymousSessionId = await getOrCreateAnonymousSessionId();
            console.log('[LibraryQuery] Using anonymous session ID:', anonymousSessionId);
          } catch (e) {
            console.error('[LibraryQuery] Error getting anonymous session ID:', e);
          }
          
          if (anonymousSessionId) {
            // Add anonymous session header as a string, not a Promise
            newHeaders['x-anonymous-session'] = anonymousSessionId;
            
            // Use the anonymous user ID from system config
            newHeaders['x-user-id'] = String(SYSTEM.ANONYMOUS_USER_ID);
            
            console.log('[LibraryQuery] Set headers for anonymous user:', {
              'x-anonymous-session': anonymousSessionId,
              'x-user-id': String(SYSTEM.ANONYMOUS_USER_ID)
            });
          } else {
            console.warn('[LibraryQuery] No anonymous session ID available');
          }
        } catch (error) {
          console.error('[LibraryQuery] Error setting up anonymous session:', error);
        }
      }
      
      setHeaders(newHeaders);
    }
    
    // Call the async function
    initializeHeaders();
  }, [user]); // Re-run effect when user changes
  
  return headers;
}