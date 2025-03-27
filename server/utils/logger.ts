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

// Ensure logs directory exists
const logsDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

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
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
});

const combinedFileTransport = new winston.transports.DailyRotateFile({
  level: 'info',
  dirname: logsDir,
  filename: 'combined-%DATE%.log',
  datePattern: 'YYYY-MM-DD',
  maxSize: '20m',
  maxFiles: '14d',
});

const errorFileTransport = new winston.transports.DailyRotateFile({
  level: 'error',
  dirname: logsDir,
  filename: 'error-%DATE%.log',
  datePattern: 'YYYY-MM-DD',
  maxSize: '20m',
  maxFiles: '14d',
});

// Specialized transports for API and auth events
const apiFileTransport = new winston.transports.DailyRotateFile({
  level: 'info',
  dirname: logsDir,
  filename: 'api-%DATE%.log',
  datePattern: 'YYYY-MM-DD',
  maxSize: '20m',
  maxFiles: '14d',
});

const authFileTransport = new winston.transports.DailyRotateFile({
  level: 'info',
  dirname: logsDir,
  filename: 'auth-%DATE%.log',
  datePattern: 'YYYY-MM-DD',
  maxSize: '20m',
  maxFiles: '14d',
});

// Create the logger
export const logger = winston.createLogger({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: process.env.NODE_ENV === 'production' ? productionFormat : developmentFormat,
  defaultMeta: { service: 'youtube-knowledge-miner' },
  transports: [
    consoleTransport,
    combinedFileTransport,
    errorFileTransport,
  ],
});

// Add specialized loggers
const apiLogger = winston.createLogger({
  level: 'info',
  format: process.env.NODE_ENV === 'production' ? productionFormat : developmentFormat,
  defaultMeta: { service: 'youtube-knowledge-miner-api' },
  transports: [
    consoleTransport,
    apiFileTransport,
  ],
});

const authLogger = winston.createLogger({
  level: 'info',
  format: process.env.NODE_ENV === 'production' ? productionFormat : developmentFormat,
  defaultMeta: { service: 'youtube-knowledge-miner-auth' },
  transports: [
    consoleTransport,
    authFileTransport,
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

export default {
  logger,
  logApiRequest,
  logApiResponse,
  logAuthEvent,
  logSecurityEvent,
};