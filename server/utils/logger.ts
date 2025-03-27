/**
 * Central Logging Service
 * 
 * This module provides a centralized logging service for the application.
 * It supports different log levels, formats, and transports for development
 * and production environments.
 */

import winston from 'winston';
import 'winston-daily-rotate-file';
import path from 'path';
import fs from 'fs';
import express from 'express';
import util from 'util';

// Ensure logs directory exists
const logsDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Determine the environment
// Check multiple sources to ensure reliability
const isProduction = () => {
  // Check NODE_ENV environment variable
  if (process.env.NODE_ENV === 'production') {
    return true;
  }
  
  // Check for production-specific paths or settings in Replit
  const isReplitProduction = !!process.env.REPL_SLUG && !process.env.REPL_OWNER;
  
  return isReplitProduction;
};

// Set environment for consistent use throughout the application
const environment = isProduction() ? 'production' : 'development';
console.log(`Logger initialized in ${environment} mode`);

// Define log formats
const developmentFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.colorize(),
  winston.format.printf(
    ({ level, message, timestamp, ...metadata }) => {
      let msg = `${timestamp} [${level}] : ${message}`;
      
      // Add the requestId if present
      if (metadata.requestId) {
        msg = `${msg} [${metadata.requestId}]`;
      }
      
      // Add metadata if present
      if (Object.keys(metadata).length > 0) {
        if (metadata.error) {
          // Format error objects specifically
          const error = metadata.error as { 
            name?: string; 
            message?: string; 
            stack?: string;
          };
          
          if (error.name && error.message) {
            msg = `${msg} - ${error.name}: ${error.message}`;
            if (error.stack) {
              msg = `${msg}\n${error.stack}`;
            }
          }
          delete metadata.error;
        }
        
        // Add remaining metadata
        if (Object.keys(metadata).length > 0) {
          msg = `${msg} ${JSON.stringify(metadata)}`;
        }
      }
      
      return msg;
    }
  )
);

const productionFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.json()
);

// Create Winston transports
const consoleTransport = new winston.transports.Console({
  level: environment === 'production' ? 'info' : 'debug',
});

const combinedFileTransport = new winston.transports.DailyRotateFile({
  level: 'info',
  filename: path.join(logsDir, 'combined-%DATE%.log'),
  datePattern: 'YYYY-MM-DD',
  maxSize: '20m',
  maxFiles: '14d',
});

const errorFileTransport = new winston.transports.DailyRotateFile({
  level: 'error',
  filename: path.join(logsDir, 'error-%DATE%.log'),
  datePattern: 'YYYY-MM-DD',
  maxSize: '20m',
  maxFiles: '14d',
});

// Specialized transports for API and auth events
const apiFileTransport = new winston.transports.DailyRotateFile({
  level: 'info',
  filename: path.join(logsDir, 'api-%DATE%.log'),
  datePattern: 'YYYY-MM-DD',
  maxSize: '20m',
  maxFiles: '14d',
});

const authFileTransport = new winston.transports.DailyRotateFile({
  level: 'info',
  filename: path.join(logsDir, 'auth-%DATE%.log'),
  datePattern: 'YYYY-MM-DD',
  maxSize: '20m',
  maxFiles: '14d',
});

// Add a direct file transport for auth events (without rotation)
const authDebugFileTransport = new winston.transports.File({
  level: 'debug',
  filename: path.join(logsDir, 'auth-debug.log'),
});

// Create the logger
export const logger = winston.createLogger({
  level: environment === 'production' ? 'info' : 'debug',
  format: environment === 'production' ? productionFormat : developmentFormat,
  defaultMeta: { 
    service: 'youtube-knowledge-miner',
    environment
  },
  transports: [
    consoleTransport,
    combinedFileTransport,
    errorFileTransport,
  ],
});

// Add specialized loggers
const apiLogger = winston.createLogger({
  level: 'info',
  format: environment === 'production' ? productionFormat : developmentFormat,
  defaultMeta: { 
    service: 'youtube-knowledge-miner-api',
    environment 
  },
  transports: [
    consoleTransport,
    apiFileTransport,
  ],
});

const authLogger = winston.createLogger({
  level: 'info',
  format: environment === 'production' ? productionFormat : developmentFormat,
  defaultMeta: { 
    service: 'youtube-knowledge-miner-auth',
    environment
  },
  transports: [
    consoleTransport,
    authFileTransport,
    // Also log auth events to the combined log file to ensure they're captured
    combinedFileTransport,
    // Use the direct file transport for debugging auth logging issues
    authDebugFileTransport
  ],
});

/**
 * Log an API request with details
 * @param requestId The unique ID for the request
 * @param method HTTP method
 * @param url Request URL
 * @param headers Request headers
 * @param query Query parameters
 * @param body Request body (for POST/PUT/PATCH)
 * @param params URL parameters
 */
export function logApiRequest(
  requestId: string,
  method: string,
  url: string,
  headers: any,
  query?: any,
  params?: any,
  body?: any
) {
  // Filter sensitive data from headers
  const filteredHeaders = { ...headers };
  const sensitiveHeaders = ['authorization', 'cookie', 'x-auth-token'];
  sensitiveHeaders.forEach(header => {
    if (filteredHeaders[header]) {
      filteredHeaders[header] = '[REDACTED]';
    }
  });
  
  // Filter sensitive data from body
  let filteredBody = body;
  if (body && typeof body === 'object') {
    filteredBody = { ...body };
    const sensitiveFields = ['password', 'token', 'secret', 'apiKey', 'api_key'];
    
    sensitiveFields.forEach(field => {
      if (filteredBody[field]) {
        filteredBody[field] = '[REDACTED]';
      }
    });
  }
  
  // Log the API request
  apiLogger.info(`API Request: ${method} ${url}`, {
    requestId,
    method,
    url,
    headers: filteredHeaders,
    query,
    params,
    body: filteredBody,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Log an API response with details
 * @param requestId The unique ID for the request
 * @param statusCode HTTP status code
 * @param responseTime Time taken to process the request in ms
 * @param body Response body (optional)
 */
export function logApiResponse(
  requestId: string,
  statusCode: number,
  responseTime: string,
  body?: any
) {
  // Filter sensitive data from response body if present
  let filteredBody = body;
  if (body && typeof body === 'object') {
    filteredBody = { ...body };
    const sensitiveFields = ['token', 'secret', 'apiKey', 'api_key'];
    
    sensitiveFields.forEach(field => {
      if (filteredBody[field]) {
        filteredBody[field] = '[REDACTED]';
      }
    });
  }
  
  // Log the API response
  apiLogger.info(`API Response: ${statusCode}`, {
    requestId,
    statusCode,
    responseTime,
    body: filteredBody,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Log an authentication event
 * @param requestId The unique ID for the request
 * @param event The authentication event type (login, logout, register, etc.)
 * @param userId The user ID (if available)
 * @param details Additional details about the event
 */
export function logAuthEvent(
  requestId: string,
  event: string,
  userId?: number | string,
  details?: any
) {
  // Filter sensitive data from details
  let filteredDetails = details;
  if (details && typeof details === 'object') {
    filteredDetails = { ...details };
    const sensitiveFields = ['password', 'token', 'secret', 'apiKey', 'api_key'];
    
    sensitiveFields.forEach(field => {
      if (filteredDetails[field]) {
        filteredDetails[field] = '[REDACTED]';
      }
    });
  }
  
  // Log the authentication event
  authLogger.info(`Auth Event: ${event}`, {
    requestId,
    event,
    userId,
    details: filteredDetails,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Log a security event (e.g., access denied, rate limiting, etc.)
 * @param requestId The unique ID for the request
 * @param event The security event type
 * @param details Additional details about the event
 */
export function logSecurityEvent(
  requestId: string,
  event: string,
  details?: any
) {
  // Filter sensitive data from details
  let filteredDetails = details;
  if (details && typeof details === 'object') {
    filteredDetails = { ...details };
    const sensitiveFields = ['password', 'token', 'secret', 'apiKey', 'api_key'];
    
    sensitiveFields.forEach(field => {
      if (filteredDetails[field]) {
        filteredDetails[field] = '[REDACTED]';
      }
    });
  }
  
  // Log the security event
  authLogger.warn(`Security Event: ${event}`, {
    requestId,
    event,
    details: filteredDetails,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Console Redirection
 * Intercepts console.log and other console methods and routes them through Winston logger
 * This ensures that all console output is properly formatted and saved to log files
 */
export function setupConsoleRedirection() {
  // Store original console methods
  const originalConsole = {
    log: console.log,
    info: console.info,
    warn: console.warn,
    error: console.error,
    debug: console.debug,
  };

  // Special paths/namespaces we want to ignore or handle differently
  const ignoredPrefixes = [
    '[winston]', // Avoid infinite loops with Winston's own logs
    '[express]', // Let Express server logs go through normally
    '[vite]',    // Vite development server logs
    'Logger initialized', // Our own logger initialization message
    '10:', // Time-prefixed logs from Express
    '11:', // Time-prefixed logs from Express
    '12:', // Time-prefixed logs from Express
    'GET /',   // Express route logs
    'POST /',  // Express route logs
    'PUT /',   // Express route logs
    'DELETE /', // Express route logs
    'PATCH /', // Express route logs
  ];

  // Get name of caller module when possible
  function getCallerInfo() {
    try {
      const err = new Error();
      const stack = err.stack?.split('\n');
      // Find the first non-logger file in the stack
      const callerLine = stack?.find(line => 
        !line.includes('logger.ts') && 
        !line.includes('node_modules/winston') &&
        line.includes('at ')
      );
      
      if (callerLine) {
        // Extract module name/path when possible
        const match = callerLine.match(/at\s+(.+?)\s+\((.+?):(\d+):(\d+)\)/);
        if (match) {
          // Full caller info available
          return { 
            function: match[1], 
            file: path.basename(match[2]),
            line: match[3]
          };
        } else {
          // Simplified caller info
          return { 
            raw: callerLine.trim()
              .replace('at ', '')
              .substring(0, 50) 
          };
        }
      }
    } catch (e) {
      // If anything goes wrong, just return null
      return null;
    }
    return null;
  }

  // Helper function to detect if message should be ignored
  function shouldIgnore(message: any) {
    if (typeof message !== 'string') return false;
    
    for (const prefix of ignoredPrefixes) {
      if (message.startsWith(prefix)) {
        return true;
      }
    }
    return false;
  }

  // Override console methods
  console.log = function(...args) {
    // Let original calls through for direct terminal visibility
    originalConsole.log.apply(console, args);
    
    // Skip logging to Winston if this is from an ignored namespace
    if (args.length > 0 && shouldIgnore(args[0])) {
      return;
    }
    
    // Get caller information for context
    const caller = getCallerInfo();
    
    // Format the message - handle both string and object cases
    let message = '';
    if (args.length === 1) {
      message = typeof args[0] === 'string' ? args[0] : JSON.stringify(args[0]);
    } else if (args.length > 1) {
      // Handle format string patterns (like console.log('User %s logged in', username))
      if (typeof args[0] === 'string' && args[0].includes('%')) {
        try {
          message = util.format.apply(null, args);
        } catch (e) {
          message = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : String(arg)).join(' ');
        }
      } else {
        message = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : String(arg)).join(' ');
      }
    }
    
    // Log through Winston
    logger.info(message, { caller });
  };

  console.info = function(...args) {
    originalConsole.info.apply(console, args);
    
    if (args.length > 0 && shouldIgnore(args[0])) {
      return;
    }
    
    const caller = getCallerInfo();
    let message = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : String(arg)).join(' ');
    logger.info(message, { caller });
  };

  console.warn = function(...args) {
    originalConsole.warn.apply(console, args);
    
    if (args.length > 0 && shouldIgnore(args[0])) {
      return;
    }
    
    const caller = getCallerInfo();
    let message = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : String(arg)).join(' ');
    logger.warn(message, { caller });
  };

  console.error = function(...args) {
    originalConsole.error.apply(console, args);
    
    if (args.length > 0 && shouldIgnore(args[0])) {
      return;
    }
    
    const caller = getCallerInfo();
    let message = args.map(arg => {
      if (arg instanceof Error) {
        return `${arg.name}: ${arg.message}\n${arg.stack}`;
      }
      return typeof arg === 'object' ? JSON.stringify(arg) : String(arg);
    }).join(' ');
    
    logger.error(message, { caller });
  };

  console.debug = function(...args) {
    originalConsole.debug.apply(console, args);
    
    if (args.length > 0 && shouldIgnore(args[0])) {
      return;
    }
    
    const caller = getCallerInfo();
    let message = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : String(arg)).join(' ');
    logger.debug(message, { caller });
  };

  // Return a function to restore original console behavior if needed
  return function restoreConsole() {
    console.log = originalConsole.log;
    console.info = originalConsole.info;
    console.warn = originalConsole.warn;
    console.error = originalConsole.error;
    console.debug = originalConsole.debug;
  };
}

/**
 * Flush all logs and close transport streams before exit.
 * This ensures that all logs are written to disk even in short-lived processes.
 * 
 * @param additionalLoggers Optional array of Winston loggers to flush alongside the default loggers
 * @returns Promise that resolves when all logs are flushed
 */
export function flushLogs(additionalLoggers: winston.Logger[] = []): Promise<void> {
  return new Promise<void>((resolve) => {
    // Create an array of promises for each logger
    const loggers = [logger, apiLogger, authLogger, ...additionalLoggers].filter(Boolean);
    
    // Start counting how many loggers we've processed
    let completed = 0;
    
    // For each logger, close all transports
    loggers.forEach(l => {
      // First end all writable streams
      l.transports.forEach(transport => {
        // Try to flush the transport if it has a flush method or end if it has a stream
        if (transport instanceof winston.transports.File || 
            transport instanceof winston.transports.DailyRotateFile) {
          // For file transports, check if they have a stream
          if ((transport as any).stream && (transport as any).stream.write) {
            (transport as any).stream.end();
          }
        }
      });
      
      // Then close the logger (which ends remaining transports)
      l.on('finish', () => {
        completed++;
        if (completed >= loggers.length) {
          resolve();
        }
      });
      
      l.end();
    });
    
    // Safety timeout in case the loggers don't emit 'finish'
    setTimeout(() => {
      resolve();
    }, 1000);
  });
}

/**
 * Register process exit handlers to ensure logs are flushed before exit
 */
export function registerExitHandlers() {
  // Handle normal exit
  process.on('exit', () => {
    // Can't use async code in 'exit' handler
    console.log('Process exiting, logs may not be completely flushed');
  });
  
  // Handle CTRL+C
  process.on('SIGINT', async () => {
    console.log('Received SIGINT, flushing logs before exit...');
    await flushLogs();
    process.exit(0);
  });
  
  // Handle CTRL+C in Windows
  process.on('SIGTERM', async () => {
    console.log('Received SIGTERM, flushing logs before exit...');
    await flushLogs();
    process.exit(0);
  });
  
  // Handle uncaught exceptions
  process.on('uncaughtException', async (error) => {
    console.error('Uncaught exception:', error);
    await flushLogs();
    process.exit(1);
  });
}

export default {
  logger,
  logApiRequest,
  logApiResponse,
  logAuthEvent,
  logSecurityEvent,
  setupConsoleRedirection,
  flushLogs,
  registerExitHandlers,
};