/**
 * Logger Utility Adapter
 * 
 * This utility provides a simple adapter to help transition from console.log
 * to the structured logging system. It's meant to be a drop-in replacement
 * for console.log in existing code.
 */

import { createLogger } from '../services/logger';

// Create a default logger for legacy code
const legacyLogger = createLogger('legacy');

/**
 * Drop-in replacement for console.log
 * @param message The message to log
 * @param ...args Additional arguments (will be added as metadata)
 */
export function log(message: any, ...args: any[]) {
  if (typeof message === 'string') {
    legacyLogger.info(message, args.length > 0 ? { args } : undefined);
  } else {
    // If first argument isn't a string, convert everything to a string and log it
    legacyLogger.info(String(message), { originalArgs: [message, ...args] });
  }
}

/**
 * Drop-in replacement for console.error
 * @param message The error message
 * @param ...args Additional arguments (will be added as metadata)
 */
export function error(message: any, ...args: any[]) {
  if (message instanceof Error) {
    // Special handling for Error objects
    legacyLogger.error(message.message, {
      stack: message.stack,
      args: args.length > 0 ? args : undefined
    });
  } else if (typeof message === 'string') {
    legacyLogger.error(message, args.length > 0 ? { args } : undefined);
  } else {
    // If first argument isn't a string or Error, convert everything to a string and log it
    legacyLogger.error(String(message), { originalArgs: [message, ...args] });
  }
}

/**
 * Drop-in replacement for console.warn
 * @param message The warning message
 * @param ...args Additional arguments (will be added as metadata)
 */
export function warn(message: any, ...args: any[]) {
  if (typeof message === 'string') {
    legacyLogger.warn(message, args.length > 0 ? { args } : undefined);
  } else {
    // If first argument isn't a string, convert everything to a string and log it
    legacyLogger.warn(String(message), { originalArgs: [message, ...args] });
  }
}

/**
 * Drop-in replacement for console.debug
 * @param message The debug message
 * @param ...args Additional arguments (will be added as metadata)
 */
export function debug(message: any, ...args: any[]) {
  if (typeof message === 'string') {
    legacyLogger.debug(message, args.length > 0 ? { args } : undefined);
  } else {
    // If first argument isn't a string, convert everything to a string and log it
    legacyLogger.debug(String(message), { originalArgs: [message, ...args] });
  }
}

// Legacy export for drop-in replacement usage
// This allows: import { logger } from '../utils/logger';
// logger.log(), logger.error(), etc.
export const logger = {
  log,
  error,
  warn,
  debug,
  info: log // Alias log as info
};

export default logger;