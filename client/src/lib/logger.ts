/**
 * Client-side logging service
 * 
 * This module provides a unified interface for logging in the browser,
 * with batched sending of logs to the server and fallback to console.
 */

import axios from 'axios';

// Configuration
const LOG_ENDPOINT = '/api/logs';
const FLUSH_INTERVAL = 10000; // 10 seconds
const MAX_BATCH_SIZE = 50;
const MAX_QUEUE_SIZE = 100;

// Log levels
type LogLevel = 'debug' | 'info' | 'warn' | 'error';

// Log entry structure
interface LogEntry {
  level: LogLevel;
  message: string;
  component?: string;
  metadata?: Record<string, any>;
  timestamp: number;
}

// Queue for batching logs
let logQueue: LogEntry[] = [];
let flushTimeout: ReturnType<typeof setTimeout> | null = null;
let isSending = false;

/**
 * Send log entries to the server
 */
async function sendLogs(entries: LogEntry[]): Promise<void> {
  if (entries.length === 0) return;
  
  try {
    isSending = true;
    await axios.post(LOG_ENDPOINT, entries);
  } catch (error) {
    // If sending to server fails, log to console as fallback
    console.error('Failed to send logs to server:', error);
    entries.forEach(entry => {
      const { level, message, component, metadata } = entry;
      console[level](`[${component || 'app'}] ${message}`, metadata);
    });
  } finally {
    isSending = false;
  }
}

/**
 * Flush the log queue to the server
 */
function flushLogs(): void {
  if (logQueue.length === 0 || isSending) return;
  
  // Take a copy of the current queue and clear it
  const entries = [...logQueue];
  logQueue = [];
  
  // Send the entries
  sendLogs(entries);
  
  // Clear the timeout
  if (flushTimeout) {
    clearTimeout(flushTimeout);
    flushTimeout = null;
  }
}

/**
 * Schedule a flush of the log queue
 */
function scheduleFlush(): void {
  if (flushTimeout) return;
  flushTimeout = setTimeout(() => {
    flushLogs();
    flushTimeout = null;
  }, FLUSH_INTERVAL);
}

/**
 * Queue a log entry for sending to the server
 * If the queue reaches the batch size, flush immediately
 */
const queueLog = (entry: LogEntry): void => {
  // Add to queue, limiting the queue size
  if (logQueue.length >= MAX_QUEUE_SIZE) {
    logQueue.shift(); // Remove oldest entry if queue is full
  }
  logQueue.push(entry);
  
  // Flush immediately if we reach batch size
  if (logQueue.length >= MAX_BATCH_SIZE) {
    flushLogs();
  } else {
    scheduleFlush();
  }
  
  // Also log to console for immediate feedback during development
  if (import.meta.env.DEV) {
    const { level, message, component, metadata } = entry;
    console[level](`[${component || 'app'}] ${message}`, metadata);
  }
};

/**
 * Component-specific logger
 */
class ComponentLogger {
  private component: string;
  
  constructor(component: string) {
    this.component = component;
  }
  
  /**
   * Log at debug level
   */
  debug(message: string, metadata: Record<string, any> = {}): void {
    queueLog({
      level: 'debug',
      message,
      component: this.component,
      metadata,
      timestamp: Date.now()
    });
  }
  
  /**
   * Log at info level
   */
  info(message: string, metadata: Record<string, any> = {}): void {
    queueLog({
      level: 'info',
      message,
      component: this.component,
      metadata,
      timestamp: Date.now()
    });
  }
  
  /**
   * Log at warn level
   */
  warn(message: string, metadata: Record<string, any> = {}): void {
    queueLog({
      level: 'warn',
      message,
      component: this.component,
      metadata,
      timestamp: Date.now()
    });
  }
  
  /**
   * Log at error level
   */
  error(message: string, metadata: Record<string, any> = {}): void {
    queueLog({
      level: 'error',
      message,
      component: this.component,
      metadata,
      timestamp: Date.now()
    });
  }
  
  /**
   * Log an Error object
   */
  logError(message: string, error: Error, metadata: Record<string, any> = {}): void {
    this.error(message, {
      ...metadata,
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack
      }
    });
  }
  
  /**
   * Track a user event (such as button click, form submission, etc.)
   */
  trackEvent(eventName: string, metadata: Record<string, any> = {}): void {
    this.info(`Event: ${eventName}`, {
      ...metadata,
      eventType: 'user_event',
      eventName
    });
  }
  
  /**
   * Track feature usage (such as search, filter, etc.)
   */
  trackFeature(featureName: string, metadata: Record<string, any> = {}): void {
    this.info(`Feature: ${featureName}`, {
      ...metadata,
      eventType: 'feature_usage',
      featureName
    });
  }
  
  /**
   * Track performance metrics
   */
  trackPerformance(operation: string, durationMs: number, metadata: Record<string, any> = {}): void {
    this.info(`Performance: ${operation} (${durationMs.toFixed(2)}ms)`, {
      ...metadata,
      eventType: 'performance',
      operation,
      durationMs
    });
  }
}

/**
 * Create a logger for a specific component
 */
export const createComponentLogger = (component: string): ComponentLogger => {
  return new ComponentLogger(component);
};

// Global logger instance
export const logger = new ComponentLogger('app');

// Flush logs when page is about to unload
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    flushLogs();
  });
}

// Export types for external use
export type { LogLevel, LogEntry };