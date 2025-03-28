/**
 * Client-side logging module
 * 
 * This module provides a consistent logging interface for client-side code,
 * with support for local storage buffering and sending logs to the server.
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  level: LogLevel;
  message: string;
  component?: string;
  timestamp: number;
  metadata?: Record<string, any>;
}

// Constants
const LOG_BUFFER_KEY = 'log_buffer';
const MAX_BUFFER_SIZE = 50; // Maximum number of logs to store before sending
const FLUSH_INTERVAL = 30 * 1000; // Send logs every 30 seconds
const MAX_FAILED_RETRIES = 3;

// State
let buffer: LogEntry[] = [];
let flushTimeoutId: number | null = null;
let failedFlushes = 0;
let isFlushInProgress = false;

// Initialize buffer from localStorage if available
try {
  const savedBuffer = localStorage.getItem(LOG_BUFFER_KEY);
  if (savedBuffer) {
    buffer = JSON.parse(savedBuffer);
  }
} catch (e) {
  console.error('Error loading log buffer from localStorage', e);
  buffer = [];
}

/**
 * Save the buffer to localStorage
 */
function saveBuffer() {
  try {
    localStorage.setItem(LOG_BUFFER_KEY, JSON.stringify(buffer));
  } catch (e) {
    // If localStorage fails (quota exceeded, etc.), just continue without saving
    console.error('Error saving log buffer to localStorage', e);
  }
}

/**
 * Send logs to the server
 */
async function flushLogs() {
  if (buffer.length === 0 || isFlushInProgress) return;
  
  isFlushInProgress = true;
  
  try {
    const logsCopy = [...buffer];
    
    const response = await fetch('/api/logs', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(logsCopy),
    });
    
    if (response.ok) {
      // Remove sent logs from buffer
      buffer = buffer.slice(logsCopy.length);
      saveBuffer();
      failedFlushes = 0;
    } else {
      failedFlushes++;
      console.error(`Failed to send logs to server: ${response.status}`);
    }
  } catch (error) {
    failedFlushes++;
    console.error('Error sending logs to server:', error);
  } finally {
    isFlushInProgress = false;
    
    // If we've failed too many times, stop trying to flush for now
    if (failedFlushes >= MAX_FAILED_RETRIES) {
      if (flushTimeoutId) {
        clearTimeout(flushTimeoutId);
        flushTimeoutId = null;
      }
    }
  }
}

/**
 * Schedule a flush of logs to the server
 */
function scheduleFlush() {
  if (flushTimeoutId === null) {
    flushTimeoutId = window.setTimeout(() => {
      flushLogs();
      flushTimeoutId = null;
      scheduleFlush();
    }, FLUSH_INTERVAL);
  }
}

/**
 * Add a log entry to the buffer
 */
function addLogEntry(level: LogLevel, message: string, component?: string, metadata?: Record<string, any>) {
  const logEntry: LogEntry = {
    level,
    message,
    component,
    timestamp: Date.now(),
    metadata,
  };
  
  buffer.push(logEntry);
  saveBuffer();
  
  // If buffer is full or this is an error, flush immediately
  if (buffer.length >= MAX_BUFFER_SIZE || level === 'error') {
    flushLogs();
  }
  
  // Schedule regular flush
  scheduleFlush();
  
  // Also log to console for development feedback
  const consoleMsg = component ? `[${component}] ${message}` : message;
  if (level === 'debug') console.debug(consoleMsg, metadata);
  else if (level === 'info') console.info(consoleMsg, metadata);
  else if (level === 'warn') console.warn(consoleMsg, metadata);
  else if (level === 'error') console.error(consoleMsg, metadata);
}

// Create logger functions for different components
export function createLogger(component: string) {
  return {
    debug: (message: string, metadata?: Record<string, any>) => 
      addLogEntry('debug', message, component, metadata),
    
    info: (message: string, metadata?: Record<string, any>) => 
      addLogEntry('info', message, component, metadata),
    
    warn: (message: string, metadata?: Record<string, any>) => 
      addLogEntry('warn', message, component, metadata),
    
    error: (message: string, metadata?: Record<string, any>) => 
      addLogEntry('error', message, component, metadata),
  };
}

// Create a default logger
const logger = {
  debug: (message: string, metadata?: Record<string, any>) => 
    addLogEntry('debug', message, undefined, metadata),
  
  info: (message: string, metadata?: Record<string, any>) => 
    addLogEntry('info', message, undefined, metadata),
  
  warn: (message: string, metadata?: Record<string, any>) => 
    addLogEntry('warn', message, undefined, metadata),
  
  error: (message: string, metadata?: Record<string, any>) => 
    addLogEntry('error', message, undefined, metadata),
};

// Add event listener for unload to flush logs when the page closes
window.addEventListener('beforeunload', () => {
  saveBuffer();
  
  // Use sendBeacon for more reliable delivery on page unload
  if (navigator.sendBeacon && buffer.length > 0) {
    navigator.sendBeacon('/api/logs', JSON.stringify(buffer));
    buffer = [];
    localStorage.removeItem(LOG_BUFFER_KEY);
  }
});

export default logger;