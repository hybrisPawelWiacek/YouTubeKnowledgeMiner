// Enhanced API Helper with better error handling

import { getOrCreateAnonymousSessionId } from './anonymous-session';

/**
 * Enhanced API request function with proper error handling and response management
 * Unlike the regular apiRequest, this function handles fetching, parsing and error tracking
 */
export async function fetchAPI<T = any>(
  method: string,
  url: string,
  data?: any,
  headers?: Record<string, string>
): Promise<T> {
  try {
    console.log(`[API Helper] ${method} request to ${url} starting`);
    
    // Create fetch options
    const options: RequestInit = {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      credentials: 'include',
    };

    // Add body data for non-GET requests
    if (method !== 'GET' && data) {
      options.body = JSON.stringify(data);
    }

    // Add anonymous session header if not already present
    if (!headers?.['x-anonymous-session']) {
      try {
        // Use await to ensure we get a string, not a Promise
        const anonymousSessionId = await getOrCreateAnonymousSessionId();
        
        if (anonymousSessionId) {
          // Set the anonymous session ID
          (options.headers as Record<string, string>)['x-anonymous-session'] = anonymousSessionId;
          
          // Add the anonymous user ID from system config if not already set
          if (!headers?.['x-user-id']) {
            (options.headers as Record<string, string>)['x-user-id'] = String(7); // Anonymous user ID is 7
          }
          
          console.log(`[API Helper] Added anonymous session headers:`, {
            'x-anonymous-session': anonymousSessionId,
            'x-user-id': (options.headers as Record<string, string>)['x-user-id']
          });
        }
      } catch (error) {
        console.error('[API Helper] Error getting anonymous session ID:', error);
      }
    }

    // Log request details
    console.log(`[API Helper] Request options:`, {
      method,
      url,
      headers: options.headers,
      data: data ? JSON.stringify(data).substring(0, 100) + '...' : 'none'
    });

    // Execute fetch
    const response = await fetch(url, options);
    console.log(`[API Helper] Response status:`, response.status, response.statusText);

    // Handle non-OK responses
    if (!response.ok) {
      // Try to get error details if available
      let errorDetails = '';
      try {
        const errorData = await response.json();
        errorDetails = JSON.stringify(errorData);
      } catch (e) {
        // If the error response is not JSON
        errorDetails = await response.text();
      }

      const error = new Error(
        `API Error ${response.status}: ${response.statusText} - ${errorDetails || 'No error details available'}`
      );
      // @ts-ignore - Add additional properties to the error object
      error.status = response.status;
      // @ts-ignore
      error.response = response;
      
      console.error(`[API Helper] Request failed:`, error);
      throw error;
    }

    // For successful responses, parse JSON
    let responseData: T;
    
    // Handle empty responses (204 No Content)
    if (response.status === 204) {
      console.log(`[API Helper] Empty response (204 No Content)`);
      responseData = {} as T;
    } else {
      try {
        const clonedResponse = response.clone();
        const responseText = await clonedResponse.text();
        console.log(`[API Helper] Raw response:`, responseText.substring(0, 200) + (responseText.length > 200 ? '...' : ''));
        
        // Parse the original response
        responseData = await response.json();
        console.log(`[API Helper] Parsed response:`, responseData);
      } catch (error) {
        console.error(`[API Helper] Error parsing response:`, error);
        throw new Error(`Failed to parse API response: ${error}`);
      }
    }

    return responseData;
  } catch (error) {
    console.error(`[API Helper] Request to ${url} failed:`, error);
    throw error;
  }
}