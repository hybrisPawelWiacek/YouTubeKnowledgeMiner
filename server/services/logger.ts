/**
 * Centralized logging service
 * 
 * This service provides a unified logging interface for the entire application,
 * configuring Winston transports for various log levels and file rotation.
 */

import * as winston from 'winston';
import * as path from 'path';
import * as fs from 'fs';

// Import DailyRotateFile
import 'winston-daily-rotate-file';

// Ensure logs directory exists
const logsDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir);
}

// Configure log format
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.printf(info => {
    const { timestamp, level, message, component, ...metadata } = info;
    const metadataStr = Object.keys(metadata).length
      ? `\n${JSON.stringify(metadata, null, 2)}`
      : '';
    return `${timestamp} [${level}]: ${message}${metadataStr}`;
  })
);

// Configure console transport
const consoleTransport = new winston.transports.Console({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: winston.format.combine(
    winston.format.colorize(),
    logFormat
  )
});

// Configure file transports with daily rotation
const combinedFileTransport = new winston.transports.DailyRotateFile({
  filename: path.join(logsDir, 'combined-%DATE%.log'),
  datePattern: 'YYYY-MM-DD',
  maxSize: '20m',
  maxFiles: '14d',
  level: 'info'
});

// Error-specific transport
const errorFileTransport = new winston.transports.DailyRotateFile({
  filename: path.join(logsDir, 'error-%DATE%.log'),
  datePattern: 'YYYY-MM-DD',
  maxSize: '20m',
  maxFiles: '30d',
  level: 'error'
});

// Create a separate transport for uncaught exceptions
const exceptionsTransport = new winston.transports.File({
  filename: path.join(logsDir, 'exceptions.log'),
  maxsize: 10 * 1024 * 1024, // 10MB
  maxFiles: 5
});

// Create a separate transport for unhandled rejections
const rejectionsTransport = new winston.transports.File({
  filename: path.join(logsDir, 'rejections.log'),
  maxsize: 10 * 1024 * 1024, // 10MB
  maxFiles: 5
});

// Also log critical errors to a separate file
fs.writeFileSync(path.join(logsDir, 'errors.log'), ''); // Create/clear the file
const criticalErrorTransport = new winston.transports.File({
  filename: path.join(logsDir, 'errors.log'),
  level: 'error'
});

// Create the default logger instance
const defaultLogger = winston.createLogger({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: logFormat,
  defaultMeta: { service: 'youtube-knowledge-miner' },
  transports: [
    consoleTransport,
    combinedFileTransport,
    errorFileTransport,
    criticalErrorTransport
  ],
  exceptionHandlers: [exceptionsTransport, consoleTransport],
  rejectionHandlers: [rejectionsTransport, consoleTransport]
});

/**
 * Create a new logger instance for a specific component
 * 
 * @param component The name of the component (e.g., 'http', 'auth', 'api')
 * @returns A configured logger instance with component metadata
 */
export function createLogger(component: string): winston.Logger {
  return defaultLogger.child({ component });
}

// Export the default logger for convenience
export default defaultLogger;