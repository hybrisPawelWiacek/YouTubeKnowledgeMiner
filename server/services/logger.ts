/**
 * Logger Service
 * 
 * This service provides a centralized logging system for the application,
 * using Winston for log formatting, transports, and level management.
 */

import path from 'path';
import winston from 'winston';
import { format, transports, createLogger as winstonCreateLogger } from 'winston';
import fs from 'fs';

// Make sure the logs directory exists
const logDir = './logs';
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir);
}

// Create custom format for log files
const customFileFormat = format.combine(
  format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  format.json()
);

// Create custom format for console logs (more readable)
const customConsoleFormat = format.combine(
  format.colorize(),
  format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  format.printf(({ level, message, timestamp, component, ...meta }) => {
    const metaStr = Object.keys(meta).length ? `\n${JSON.stringify(meta, null, 2)}` : '';
    const compStr = component ? `[${component}] ` : '';
    return `${timestamp} ${level}: ${compStr}${message}${metaStr}`;
  })
);

// Define extended logger type
interface ExtendedLogger extends winston.Logger {
  logError: (message: string, error: Error, meta?: Record<string, any>) => void;
}

// Create the main logger instance
export const logger = winstonCreateLogger({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: format.combine(
    format.timestamp(),
    format.errors({ stack: true }),
    format.json()
  ),
  defaultMeta: { component: 'app' },
  transports: [
    // Write logs to console in development
    new transports.Console({
      format: customConsoleFormat,
    }),
    
    // Write all logs to combined log files
    new transports.File({ 
      filename: path.join(logDir, 'combined.log'),
      format: customFileFormat
    }),
    
    // Write all logs with level 'error' and below to errors.log
    new transports.File({ 
      filename: path.join(logDir, 'errors.log'), 
      level: 'error',
      format: customFileFormat
    }),
    
    // Write daily rotated log files
    new transports.File({
      filename: path.join(logDir, `combined-${new Date().toISOString().split('T')[0]}.log`),
      format: customFileFormat
    }),
  ],
  exceptionHandlers: [
    new transports.File({ 
      filename: path.join(logDir, 'exceptions.log'),
      format: customFileFormat
    })
  ],
  rejectionHandlers: [
    new transports.File({ 
      filename: path.join(logDir, 'rejections.log'),
      format: customFileFormat
    })
  ]
});

// Add function to log errors with stack traces
logger.logError = (message: string, error: Error, meta: Record<string, any> = {}) => {
  logger.error(message, {
    ...meta,
    error: {
      message: error.message,
      stack: error.stack,
      name: error.name
    }
  });
};

// Create a component-specific logger
export function createLogger(component: string) {
  // Create a child logger with component metadata
  const componentLogger = logger.child({ component }) as ExtendedLogger;
  
  // Add a dedicated file transport for the component
  const componentTransport = new transports.File({
    filename: path.join(logDir, `${component}.log`),
    format: customFileFormat
  });
  
  // Add the transport to the logger
  componentLogger.add(componentTransport);
  
  // Add logError method to child logger
  componentLogger.logError = (message: string, error: Error, meta: Record<string, any> = {}) => {
    componentLogger.error(message, {
      ...meta,
      error: {
        message: error.message,
        stack: error.stack,
        name: error.name
      }
    });
  };
  
  return componentLogger;
}

// Create a special auth logger
export const authLogger = createLogger('auth');

// Create a debug logger
export const debugLogger = createLogger('debug');

// Create a UI logger for client-side issues
export const uiLogger = createLogger('ui');

// Create a QA logger for conversation issues
export const qaLogger = createLogger('qa');

// Add specific methods for QA conversation logging
qaLogger.logConversation = (action: string, conversationId: number, meta: Record<string, any> = {}) => {
  qaLogger.info(`[Conversation ${conversationId}] ${action}`, {
    ...meta,
    conversationId,
    timestamp: new Date().toISOString()
  });
};

qaLogger.logMessage = (action: string, conversationId: number, messageData: any, meta: Record<string, any> = {}) => {
  qaLogger.info(`[Message] ${action} in conversation ${conversationId}`, {
    ...meta,
    conversationId,
    messageData,
    timestamp: new Date().toISOString()
  });
};