/**
 * Logger adapter for migrating from old logging system
 * 
 * This utility module provides a bridge between the old console.log-based
 * logging system and the new structured logger. It allows for a gradual
 * migration by mapping old log calls to the new logger.
 */

import { createLogger } from '../services/logger';

// Create a legacy logger to capture old logging patterns
const legacyLogger = createLogger('legacy');

/**
 * Helper to transform old logging patterns to the new system
 * This function maps console.log/info/warn/error to the appropriate
 * method in the new logger, preserving context and metadata.
 */
export function log(message: string, ...args: any[]): void {
  legacyLogger.info(message, { args });
}

export function info(message: string, ...args: any[]): void {
  legacyLogger.info(message, { args });
}

export function warn(message: string, ...args: any[]): void {
  legacyLogger.warn(message, { args });
}

export function error(message: string, ...args: any[]): void {
  legacyLogger.error(message, { args });
}

export function debug(message: string, ...args: any[]): void {
  legacyLogger.debug(message, { args });
}

// Export a default function for backward compatibility
export default log;