/**
 * Logger Utility
 * 
 * This module provides simplified access to the logger service,
 * with convenience functions for common logging operations.
 */

import { logger, createLogger } from '../services/logger';

// Re-export the main logger instance
export { logger };

// Convenience function for logging at different levels
export const debug = (message: string, meta = {}) => logger.debug(message, meta);
export const info = (message: string, meta = {}) => logger.info(message, meta);
export const warn = (message: string, meta = {}) => logger.warn(message, meta);
export const error = (message: string, meta = {}) => logger.error(message, meta);

// Special function for logging errors with stack traces
export const logError = (message: string, error: Error, meta = {}) => {
  logger.logError(message, error, meta);
};

/**
 * Create a component-specific logger with a fluent API
 */
export function createComponentLogger(component: string) {
  const componentLogger = createLogger(component);
  
  return {
    // Standard log levels
    debug: (message: string, meta = {}) => componentLogger.debug(message, meta),
    info: (message: string, meta = {}) => componentLogger.info(message, meta),
    warn: (message: string, meta = {}) => componentLogger.warn(message, meta),
    error: (message: string, meta = {}) => componentLogger.error(message, meta),
    
    // Special method for logging errors with stack traces
    logError: (message: string, error: Error, meta = {}) => {
      componentLogger.logError(message, error, meta);
    },
    
    // Method to log with a child context
    withContext: (context: Record<string, any>) => {
      return {
        debug: (message: string, meta = {}) => componentLogger.debug(message, { ...context, ...meta }),
        info: (message: string, meta = {}) => componentLogger.info(message, { ...context, ...meta }),
        warn: (message: string, meta = {}) => componentLogger.warn(message, { ...context, ...meta }),
        error: (message: string, meta = {}) => componentLogger.error(message, { ...context, ...meta }),
        logError: (message: string, error: Error, meta = {}) => {
          componentLogger.logError(message, error, { ...context, ...meta });
        }
      };
    }
  };
}

/**
 * Safely stringify objects for logging, handling circular references
 */
export function safeStringify(obj: any): string {
  const cache = new Set();
  return JSON.stringify(obj, (key, value) => {
    if (typeof value === 'object' && value !== null) {
      if (cache.has(value)) {
        return '[Circular Reference]';
      }
      cache.add(value);
    }
    return value;
  }, 2);
}