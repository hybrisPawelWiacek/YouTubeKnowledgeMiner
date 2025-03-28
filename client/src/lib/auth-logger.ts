/**
 * Auth Logger
 * 
 * Client-side helper for sending auth events to the server-side logging system.
 * This replaces console.log calls in authentication-related code with structured logging.
 */

import { v4 as uuidv4 } from 'uuid';

// Generate a unique request ID for the current browser session
// This helps correlate logs across multiple API calls
let sessionRequestId = '';

/**
 * Initialize or retrieve the current session request ID
 * This helps correlate logs across page refreshes
 */
function getRequestId(): string {
  if (!sessionRequestId) {
    // Check if we have a stored request ID from a previous page load
    const storedId = sessionStorage.getItem('auth_log_request_id');
    if (storedId) {
      sessionRequestId = storedId;
    } else {
      // Generate a new request ID and store it for future page loads
      sessionRequestId = uuidv4();
      sessionStorage.setItem('auth_log_request_id', sessionRequestId);
    }
  }
  return sessionRequestId;
}

/**
 * Send an auth event to the server logging system
 * 
 * @param event Auth event name/description
 * @param userId User ID if available
 * @param details Additional details about the event
 */
export async function logAuthEvent(
  event: string,
  userId?: number | string,
  details?: any
): Promise<void> {
  try {
    // Always log to console for immediate visibility during development
    console.log(`[Auth] ${event}`, userId ? `User: ${userId}` : '', details || '');
    
    // Send to server-side logger if we're in a browser environment
    if (typeof window !== 'undefined') {
      const requestId = getRequestId();
      
      // Send the log event to the server
      fetch('/api/log/auth', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Request-ID': requestId
        },
        body: JSON.stringify({
          event,
          userId,
          details,
          clientTimestamp: new Date().toISOString(),
          userAgent: navigator.userAgent,
          location: window.location.href
        }),
        // Don't wait for response, fire and forget
        keepalive: true
      }).catch(err => {
        // Silent error - we don't want to break the application flow 
        // for logging failures, just log to console
        console.error('[Auth Logger] Failed to send log to server:', err);
      });
    }
  } catch (error) {
    // Never let logging errors affect the application
    console.error('[Auth Logger] Error in logAuthEvent:', error);
  }
}

/**
 * Log a sign-in event
 */
export function logSignIn(
  userId: number | string,
  method: 'email' | 'google' | 'magic_link' | 'demo' | 'direct' | 'anonymous',
  details?: any
): void {
  logAuthEvent(`sign_in_${method}`, userId, details);
}

/**
 * Log a sign-out event
 */
export function logSignOut(
  userId: number | string,
  method: 'normal' | 'demo' | 'direct' | 'session_expired',
  details?: any
): void {
  logAuthEvent(`sign_out_${method}`, userId, details);
}

/**
 * Log a sign-up event
 */
export function logSignUp(
  userId: number | string,
  method: 'email' | 'google' | 'anonymous',
  details?: any
): void {
  logAuthEvent(`sign_up_${method}`, userId, details);
}

/**
 * Log an anonymous session event
 */
export function logAnonymousSession(
  action: 'create' | 'restore' | 'preserve' | 'clear',
  sessionId: string,
  details?: any
): void {
  logAuthEvent(`anonymous_session_${action}`, undefined, {
    sessionId,
    ...details
  });
}

/**
 * Log a session state change
 */
export function logSessionState(
  state: 'initialized' | 'changed' | 'refreshed' | 'expired',
  userId?: number | string,
  details?: any
): void {
  logAuthEvent(`session_${state}`, userId, details);
}