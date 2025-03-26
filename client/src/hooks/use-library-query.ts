import { useSupabase } from '@/hooks/use-supabase';

export function useLibraryQueryHeaders() {
  const { user } = useSupabase();
  
  // If a userId is available, add it to the headers
  const headers: HeadersInit = {};
  
  // Add extensive debugging to diagnose user ID issues
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
    console.warn('No user ID available for library query');
  }
  
  return headers;
}