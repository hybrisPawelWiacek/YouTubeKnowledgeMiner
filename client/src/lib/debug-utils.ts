/**
 * Debug utilities for troubleshooting session management issues
 */

export const DEBUG_STORAGE_KEY = 'debug-state-change-log';

/**
 * Create a safe copy of data that can be stringified
 * This handles circular references, errors, and DOM nodes
 */
function createSafeObject(obj: any, depth: number = 0, maxDepth: number = 3): any {
  // Guard against excessive recursion
  if (depth > maxDepth) {
    return "[Object: max depth reached]";
  }
  
  // Handle null and primitive values directly
  if (obj === null || obj === undefined || typeof obj !== 'object') {
    return obj;
  }
  
  // Handle special objects
  if (obj instanceof Error) {
    return {
      errorMessage: obj.message,
      errorName: obj.name,
      errorStack: obj.stack
    };
  }
  
  // Handle DOM nodes
  if (typeof Node !== 'undefined' && obj instanceof Node) {
    return `[DOM Node: ${obj.nodeName}]`;
  }
  
  // Handle arrays
  if (Array.isArray(obj)) {
    return obj.map(item => createSafeObject(item, depth + 1, maxDepth));
  }
  
  // Handle regular objects
  const result: Record<string, any> = {};
  
  // Process each property safely
  try {
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        try {
          const value = obj[key];
          
          // Skip functions
          if (typeof value === 'function') {
            result[key] = "[Function]";
            continue;
          }
          
          // Handle circular references by catching maximum call stack errors
          try {
            result[key] = createSafeObject(value, depth + 1, maxDepth);
          } catch (circularError) {
            result[key] = "[Circular Reference]";
          }
        } catch (propertyError: any) {
          result[key] = `[Property Error: ${propertyError?.message || 'Unknown error'}]`;
        }
      }
    }
  } catch (objectError: any) {
    return `[Object Error: ${objectError?.message || 'Unknown error'}]`;
  }
  
  return result;
}

/**
 * Log state changes for debugging purposes
 * @param component Component name
 * @param action Action being performed
 * @param data Additional data to log
 */
export function logStateChange(component: string, action: string, data?: any) {
  try {
    // Make sure data is serializable
    let safeData: any = null;
    
    if (data) {
      // Handle data as an object or as a primitive
      if (typeof data === 'object' && data !== null) {
        safeData = createSafeObject(data);
      } else {
        // Primitive values can be used directly
        safeData = data;
      }
    }
    
    // Create a log entry with our safe data
    const logEntry = {
      timestamp: new Date().toISOString(),
      component, 
      action,
      data: safeData,
    };
    
    // Get existing logs
    const existingLogsStr = localStorage.getItem(DEBUG_STORAGE_KEY);
    let existingLogs = [];
    try {
      if (existingLogsStr) {
        existingLogs = JSON.parse(existingLogsStr);
      }
    } catch (parseError) {
      console.error('Failed to parse existing debug logs, resetting', parseError);
      // Reset if corrupted
      localStorage.removeItem(DEBUG_STORAGE_KEY);
    }
    
    // Make sure existingLogs is an array
    if (!Array.isArray(existingLogs)) {
      existingLogs = [];
    }
    
    // Add new log and limit to last 100 entries
    const updatedLogs = [logEntry, ...existingLogs].slice(0, 100);
    
    // Save updated logs - with try/catch for the stringify operation
    try {
      localStorage.setItem(DEBUG_STORAGE_KEY, JSON.stringify(updatedLogs));
    } catch (stringifyError) {
      console.error('Failed to stringify debug logs:', stringifyError);
      // Save just the current entry without historical data
      try {
        localStorage.setItem(DEBUG_STORAGE_KEY, JSON.stringify([logEntry]));
      } catch (emergencyError) {
        // Last resort - remove the problematic log storage
        localStorage.removeItem(DEBUG_STORAGE_KEY);
      }
    }
    
    // Also output to console - with safe error handling
    try {
      console.log(`[DEBUG] ${component} - ${action}`, data || '');
    } catch (consoleError) {
      console.error('Failed to log to console:', consoleError);
    }
  } catch (error) {
    // Critical error in the overall logging function
    console.error('Critical debug logging error:', error);
    
    // Attempt immediate recovery
    try {
      localStorage.removeItem(DEBUG_STORAGE_KEY);
      console.log(`[DEBUG] ${component} - ${action} (after log error)`, 'Data omitted due to error');
    } catch (e) {
      // Nothing more we can do
    }
  }
}

/**
 * Get all debug logs
 */
export function getDebugLogs() {
  try {
    const logsStr = localStorage.getItem(DEBUG_STORAGE_KEY);
    return logsStr ? JSON.parse(logsStr) : [];
  } catch (error) {
    console.error('Error retrieving debug logs:', error);
    return [];
  }
}

/**
 * Clear all debug logs
 */
export function clearDebugLogs() {
  localStorage.removeItem(DEBUG_STORAGE_KEY);
  console.log('[DEBUG] Logs cleared');
}

/**
 * Dump a full snapshot of relevant localStorage items
 * with enhanced error handling and object safety
 */
export function dumpStorageSnapshot() {
  try {
    const snapshot: Record<string, any> = {};
    
    // List of keys to include in the snapshot
    const keysToInclude = [
      'youtube-miner-demo-session',
      'youtube-miner-demo-session:timestamp',
      'youtube-miner-supabase-session', 
      'youtube-miner-anonymous-session',
      'youtube-miner-anonymous-data',
      'ytk_anonymous_session_id',
      'ytk_anonymous_session_id_backup',
      'ytk_anonymous_session_id_preserved',
      'ytk_anonymous_session_id_timestamp'
    ];
    
    // Try to collect all localStorage keys but handle potential errors
    try {
      snapshot['availableKeys'] = Object.keys(localStorage);
    } catch (keysError) {
      console.error('[DEBUG] Error getting localStorage keys:', keysError);
      snapshot['availableKeys'] = '[Error retrieving keys]';
    }
    
    // Process each key individually with error isolation
    for (const key of keysToInclude) {
      try {
        const value = localStorage.getItem(key);
        if (value) {
          try {
            // Try to parse as JSON first
            const parsedValue = JSON.parse(value);
            // Use our safe object creator to handle circular references
            snapshot[key] = createSafeObject(parsedValue);
          } catch (parseError) {
            // If it's not valid JSON, store as a string
            snapshot[key] = value;
          }
        } else {
          snapshot[key] = null;
        }
      } catch (itemError: any) {
        console.error(`[DEBUG] Error processing storage key ${key}:`, itemError);
        snapshot[key] = `[Error: ${itemError?.message || 'Unknown error'}]`;
      }
    }
    
    // Apply security sanitization for logging (truncate tokens) with error handling
    try {
      if (snapshot['youtube-miner-demo-session']?.access_token) {
        snapshot['youtube-miner-demo-session'].access_token = 
          snapshot['youtube-miner-demo-session'].access_token.substring(0, 10) + '...';
      }
      
      if (snapshot['youtube-miner-supabase-session']?.access_token) {
        snapshot['youtube-miner-supabase-session'].access_token = 
          snapshot['youtube-miner-supabase-session'].access_token.substring(0, 10) + '...';
      }
    } catch (sanitizeError) {
      console.error('[DEBUG] Error sanitizing token values:', sanitizeError);
    }
    
    // Safely log the snapshot
    try {
      console.log('[DEBUG] Storage snapshot:', snapshot);
    } catch (logError) {
      console.error('[DEBUG] Error logging storage snapshot:', logError);
    }
    
    return snapshot;
  } catch (error: any) {
    // Critical error in the overall function
    console.error('[DEBUG] Critical error in dumpStorageSnapshot:', error);
    return { error: `Failed to dump storage snapshot: ${error?.message || 'Unknown error'}` };
  }
}

/**
 * Check if the demo session is valid and present
 * with enhanced error handling
 */
export function checkDemoSessionHealth(): { 
  exists: boolean; 
  valid: boolean; 
  issues: string[];
  data: any;
} {
  // Default result structure with fail-safe values
  const result = {
    exists: false,
    valid: false,
    issues: [] as string[],
    data: null as any
  };
  
  try {
    // Check if the session exists with error handling
    let sessionStr: string | null = null;
    try {
      sessionStr = localStorage.getItem('youtube-miner-demo-session');
      result.exists = !!sessionStr;
    } catch (storageError: any) {
      result.issues.push(`Error accessing localStorage: ${storageError.message || 'Unknown error'}`);
      return result;
    }
    
    if (!result.exists) {
      result.issues.push('Demo session does not exist in localStorage');
      return result;
    }
    
    // Check if the session is valid JSON
    try {
      const sessionData = JSON.parse(sessionStr!);
      
      // Use our safe object creator to handle any potential circular references
      result.data = createSafeObject(sessionData);
      
      // Check essential properties with safe optional chaining
      if (!sessionData?.user) {
        result.issues.push('Session exists but has no user property');
      } else {
        // Check user properties safely
        if (!sessionData.user?.id) {
          result.issues.push('Session user has no ID property');
        }
        
        // Use optional chaining for nested properties
        if (sessionData.user?.user_metadata?.is_demo !== true) {
          result.issues.push('Session user is not marked as demo user');
        }
      }
      
      if (!sessionData?.access_token) {
        result.issues.push('Session has no access_token property');
      }
      
      // If no issues found so far, mark as valid
      result.valid = result.issues.length === 0;
    } catch (parseError: any) {
      // Safe handling of JSON parsing errors
      result.issues.push(`Session is not valid JSON: ${parseError.message || parseError}`);
    }
    
    return result;
  } catch (error: any) {
    // Critical error handler - fail safely
    console.error('[DEBUG] Critical error in checkDemoSessionHealth:', error);
    
    // Make sure we return a valid result object even in case of catastrophic failure
    result.exists = false;
    result.valid = false;
    result.issues.push(`Critical error: ${error.message || 'Unknown error'}`);
    result.data = null;
    
    return result;
  }
}