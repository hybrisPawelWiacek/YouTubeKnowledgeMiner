/**
 * Debug utilities for troubleshooting session management issues
 */

export const DEBUG_STORAGE_KEY = 'debug-state-change-log';

/**
 * Log state changes for debugging purposes
 * @param component Component name
 * @param action Action being performed
 * @param data Additional data to log
 */
export function logStateChange(component: string, action: string, data?: any) {
  try {
    // Make sure data is serializable
    let safeData: any = {};
    if (data) {
      // Convert Error objects to strings and handle circular references
      Object.keys(data).forEach(key => {
        if (data[key] instanceof Error) {
          safeData[key] = data[key].toString();
        } else if (typeof data[key] === 'object' && data[key] !== null) {
          try {
            // Test if it can be stringified
            JSON.stringify(data[key]);
            safeData[key] = data[key];
          } catch (e) {
            // If it can't be stringified (circular reference), use a string representation
            safeData[key] = `[Object: ${typeof data[key]}]`;
          }
        } else {
          safeData[key] = data[key];
        }
      });
    }
    
    // Create a log entry
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
    
    // Save updated logs
    localStorage.setItem(DEBUG_STORAGE_KEY, JSON.stringify(updatedLogs));
    
    // Also output to console
    console.log(`[DEBUG] ${component} - ${action}`, data || '');
  } catch (error) {
    console.error('Debug logging error:', error);
    // Attempt immediate recovery
    try {
      localStorage.removeItem(DEBUG_STORAGE_KEY);
      console.log(`[DEBUG] ${component} - ${action} (after log error)`, 
        data ? 'Data omitted due to error' : '');
    } catch (e) {
      // Really can't do anything else
      console.error('Critical error in debug logging, recovery failed:', e);
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
      'youtube-miner-anonymous-data'
    ];
    
    // Also include all available localStorage keys for reference
    snapshot['availableKeys'] = Object.keys(localStorage);
    
    for (const key of keysToInclude) {
      const value = localStorage.getItem(key);
      if (value) {
        try {
          snapshot[key] = JSON.parse(value);
        } catch (e) {
          snapshot[key] = value;
        }
      } else {
        snapshot[key] = null;
      }
    }
    
    // Apply security sanitization for logging (truncate tokens)
    if (snapshot['youtube-miner-demo-session']?.access_token) {
      snapshot['youtube-miner-demo-session'].access_token = 
        snapshot['youtube-miner-demo-session'].access_token.substring(0, 10) + '...';
    }
    
    if (snapshot['youtube-miner-supabase-session']?.access_token) {
      snapshot['youtube-miner-supabase-session'].access_token = 
        snapshot['youtube-miner-supabase-session'].access_token.substring(0, 10) + '...';
    }
    
    console.log('[DEBUG] Storage snapshot:', snapshot);
    return snapshot;
  } catch (error) {
    console.error('[DEBUG] Error in dumpStorageSnapshot:', error);
    return { error: 'Failed to dump storage snapshot' };
  }
}

/**
 * Check if the demo session is valid and present
 */
export function checkDemoSessionHealth(): { 
  exists: boolean; 
  valid: boolean; 
  issues: string[];
  data: any;
} {
  try {
    const result = {
      exists: false,
      valid: false,
      issues: [] as string[],
      data: null as any
    };
    
    // Check if the session exists
    const sessionStr = localStorage.getItem('youtube-miner-demo-session');
    result.exists = !!sessionStr;
    
    if (!result.exists) {
      result.issues.push('Demo session does not exist in localStorage');
      return result;
    }
    
    // Check if the session is valid JSON
    try {
      const sessionData = JSON.parse(sessionStr!);
      result.data = sessionData;
      
      // Check essential properties
      if (!sessionData.user) {
        result.issues.push('Session exists but has no user property');
      } else {
        // Check user properties
        if (!sessionData.user.id) {
          result.issues.push('Session user has no ID property');
        }
        
        if (!sessionData.user.user_metadata?.is_demo) {
          result.issues.push('Session user is not marked as demo user');
        }
      }
      
      if (!sessionData.access_token) {
        result.issues.push('Session has no access_token property');
      }
      
      // If no issues, session is valid
      result.valid = result.issues.length === 0;
      
    } catch (e) {
      result.issues.push(`Session is not valid JSON: ${e}`);
    }
    
    return result;
  } catch (error) {
    console.error('[DEBUG] Error in checkDemoSessionHealth:', error);
    return {
      exists: false,
      valid: false,
      issues: [`Critical error: ${error}`],
      data: null
    };
  }
}