/**
 * Client-side Logger Module
 * 
 * This module provides browser-compatible logging with level filtering
 * and the ability to send logs to the server for centralized storage.
 */

// Log levels and their priority
const LOG_LEVELS = {
  debug: 0,
  info: 1,
  warn: 2, 
  error: 3
};

// Set minimum log level based on environment
const MIN_LOG_LEVEL = process.env.NODE_ENV === 'production' ? LOG_LEVELS.info : LOG_LEVELS.debug;

// Default meta information attached to all logs
const DEFAULT_META = {
  client: true,
  userAgent: navigator.userAgent,
  url: window.location.href
};

// Batch size for server sync
const BATCH_SIZE = 10;

// Queue of logs waiting to be sent to server
let logQueue: any[] = [];

// Generate unique session ID for correlating logs
const sessionId = `client_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

// Track if a sync is in progress
let isSyncing = false;

/**
 * Main logger object with methods for each log level
 */
export const logger = {
  debug: (message: string, meta: Record<string, any> = {}) => log('debug', message, meta),
  info: (message: string, meta: Record<string, any> = {}) => log('info', message, meta),
  warn: (message: string, meta: Record<string, any> = {}) => log('warn', message, meta),
  error: (message: string, meta: Record<string, any> = {}) => log('error', message, meta),
  
  // Log error with stack trace
  logError: (message: string, error: Error, meta: Record<string, any> = {}) => {
    return log('error', message, {
      ...meta,
      error: {
        message: error.message,
        stack: error.stack,
        name: error.name
      }
    });
  }
};

/**
 * Core logging function
 */
function log(level: keyof typeof LOG_LEVELS, message: string, meta: Record<string, any> = {}): void {
  // Skip if below minimum level
  if (LOG_LEVELS[level] < MIN_LOG_LEVEL) return;
  
  // Create log entry
  const timestamp = new Date().toISOString();
  const logEntry = {
    level,
    message,
    timestamp,
    sessionId,
    ...DEFAULT_META,
    ...meta
  };
  
  // Console output
  consoleOutput(level, message, logEntry);
  
  // Add to queue for server sync
  logQueue.push(logEntry);
  
  // Trigger sync if queue reaches batch size or is an error
  if (logQueue.length >= BATCH_SIZE || level === 'error') {
    syncLogsToServer();
  }
}

/**
 * Output log to console with appropriate styling
 */
function consoleOutput(level: string, message: string, data: any): void {
  // Do nothing in production unless explicitly enabled
  if (process.env.NODE_ENV === 'production' && !process.env.ENABLE_PRODUCTION_LOGS) {
    return;
  }
  
  const consoleMethod = (console as any)[level] || console.log;
  const timestamp = new Date().toISOString().split('T')[1].slice(0, -1);
  
  switch(level) {
    case 'debug':
      consoleMethod(`%c${timestamp} [DEBUG]`, 'color: gray', message, data);
      break;
    case 'info':
      consoleMethod(`%c${timestamp} [INFO]`, 'color: blue', message, data);
      break;
    case 'warn':
      consoleMethod(`%c${timestamp} [WARN]`, 'color: orange', message, data);
      break;
    case 'error':
      consoleMethod(`%c${timestamp} [ERROR]`, 'color: red; font-weight: bold', message, data);
      break;
    default:
      consoleMethod(`${timestamp} [${level.toUpperCase()}]`, message, data);
  }
}

/**
 * Send collected logs to server
 */
async function syncLogsToServer(): Promise<void> {
  // Skip if empty queue or sync in progress
  if (logQueue.length === 0 || isSyncing) return;
  
  // Mark sync in progress
  isSyncing = true;
  
  // Take logs from queue up to batch size
  const logsToSend = logQueue.slice(0, BATCH_SIZE);
  
  try {
    // Send logs to server endpoint
    const response = await fetch('/api/logs', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ logs: logsToSend })
    });
    
    if (response.ok) {
      // Remove sent logs from queue
      logQueue = logQueue.slice(logsToSend.length);
    } else {
      console.error('Failed to sync logs to server:', await response.text());
    }
  } catch (error) {
    console.error('Error syncing logs to server:', error);
  } finally {
    // Reset sync flag
    isSyncing = false;
    
    // If more logs in queue, schedule another sync
    if (logQueue.length > 0) {
      setTimeout(syncLogsToServer, 1000);
    }
  }
}

// Set up periodic sync
setInterval(syncLogsToServer, 30000);

// Sync logs on page unload
window.addEventListener('beforeunload', () => {
  // Use synchronous approach for unload
  if (logQueue.length > 0) {
    navigator.sendBeacon('/api/logs', JSON.stringify({ logs: logQueue }));
  }
});

// Default export
export default logger;