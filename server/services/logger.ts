/**
 * Central logging service for the application
 * 
 * This service provides a unified interface for logging throughout the application,
 * with support for different log levels, structured logging, and various transports.
 */

import winston from 'winston';
import fs from 'fs';
import path from 'path';
import { Request, Response } from 'express';

// Create logs directory if it doesn't exist
const logsDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Configure separate log files for different concerns
const errorFile = path.join(logsDir, 'error.log');
const combinedFile = path.join(logsDir, 'combined.log');
const httpFile = path.join(logsDir, 'http.log');
const authFile = path.join(logsDir, 'auth.log');
const apiFile = path.join(logsDir, 'api.log');
const clientFile = path.join(logsDir, 'client.log');
const performanceFile = path.join(logsDir, 'performance.log');

// Custom log format
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json()
);

// Console format (more human-readable for development)
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, ...rest }) => {
    const meta = Object.keys(rest).length ? JSON.stringify(rest, null, 2) : '';
    return `${timestamp} [${level}]: ${message}${meta ? '\n' + meta : ''}`;
  })
);

// Create the winston logger instance
const winstonLogger = winston.createLogger({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: logFormat,
  defaultMeta: { service: 'api' },
  transports: [
    // Write all logs to their respective files
    new winston.transports.File({ 
      filename: errorFile,
      level: 'error'
    }),
    new winston.transports.File({ 
      filename: combinedFile 
    })
  ],
  exceptionHandlers: [
    new winston.transports.File({ 
      filename: path.join(logsDir, 'exceptions.log') 
    })
  ],
  rejectionHandlers: [
    new winston.transports.File({ 
      filename: path.join(logsDir, 'rejections.log') 
    })
  ]
});

// Add console transport in development
if (process.env.NODE_ENV !== 'production') {
  winstonLogger.add(
    new winston.transports.Console({
      format: consoleFormat
    })
  );
}

/**
 * Component-specific logger factory
 * This provides logger instances for different components of the application
 */
class Logger {
  private component: string;
  private winstonInstance: winston.Logger;
  
  constructor(component: string) {
    this.component = component;
    
    // Create specialized loggers for specific components
    switch (component) {
      case 'http':
        this.winstonInstance = this.createTransportLogger(httpFile, component);
        break;
      case 'auth':
        this.winstonInstance = this.createTransportLogger(authFile, component);
        break;
      case 'api':
        this.winstonInstance = this.createTransportLogger(apiFile, component);
        break;
      case 'client':
        this.winstonInstance = this.createTransportLogger(clientFile, component);
        break;
      case 'performance':
        this.winstonInstance = this.createTransportLogger(performanceFile, component);
        break;
      default:
        this.winstonInstance = winstonLogger;
    }
  }
  
  /**
   * Create a specialized logger with a dedicated file transport
   */
  private createTransportLogger(filename: string, component: string): winston.Logger {
    return winston.createLogger({
      level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
      format: logFormat,
      defaultMeta: { component },
      transports: [
        // Write component-specific logs to dedicated file
        new winston.transports.File({ 
          filename
        }),
        // Also write to error file
        new winston.transports.File({ 
          filename: errorFile,
          level: 'error'
        }),
        // Also write to combined file
        new winston.transports.File({ 
          filename: combinedFile 
        }),
        // Add console in development
        ...(process.env.NODE_ENV !== 'production' 
          ? [new winston.transports.Console({ format: consoleFormat })]
          : [])
      ]
    });
  }
  
  /**
   * Log at debug level
   */
  debug(message: string, metadata: Record<string, any> = {}): void {
    this.winstonInstance.debug(message, {
      ...metadata,
      component: this.component
    });
  }
  
  /**
   * Log at info level
   */
  info(message: string, metadata: Record<string, any> = {}): void {
    this.winstonInstance.info(message, {
      ...metadata,
      component: this.component
    });
  }
  
  /**
   * Log at warn level
   */
  warn(message: string, metadata: Record<string, any> = {}): void {
    this.winstonInstance.warn(message, {
      ...metadata,
      component: this.component
    });
  }
  
  /**
   * Log at error level
   */
  error(message: string, metadata: Record<string, any> = {}): void {
    this.winstonInstance.error(message, {
      ...metadata,
      component: this.component
    });
  }
  
  /**
   * Log an Error object with stack trace
   */
  logError(message: string, error: Error, metadata: Record<string, any> = {}): void {
    this.winstonInstance.error(message, {
      ...metadata,
      component: this.component,
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack
      }
    });
  }
  
  /**
   * Log HTTP request details
   */
  logHttpRequest(req: Request, metadata: Record<string, any> = {}): void {
    if (this.component !== 'http') {
      return;
    }
    
    this.info(`${req.method} ${req.path}`, {
      ...metadata,
      request: {
        method: req.method,
        path: req.path,
        query: req.query,
        headers: filterSensitiveHeaders(req.headers),
        ip: req.ip,
        userId: (req as any).user?.id || 'anonymous'
      }
    });
  }
  
  /**
   * Log HTTP response details
   */
  logHttpResponse(
    req: Request, 
    res: Response, 
    durationMs: number, 
    metadata: Record<string, any> = {}
  ): void {
    if (this.component !== 'http') {
      return;
    }
    
    const level = res.statusCode >= 400 ? 'warn' : 'info';
    
    this[level](`${req.method} ${req.path} ${res.statusCode} ${durationMs.toFixed(2)}ms`, {
      ...metadata,
      response: {
        statusCode: res.statusCode,
        duration: `${durationMs.toFixed(2)}ms`,
        contentType: res.get('Content-Type'),
        contentLength: res.get('Content-Length')
      }
    });
  }
  
  /**
   * Log authentication events
   */
  logAuth(action: string, metadata: Record<string, any> = {}): void {
    if (this.component !== 'auth') {
      return;
    }
    
    this.info(`Auth: ${action}`, {
      ...metadata,
      authAction: action
    });
  }
  
  /**
   * Log API calls
   */
  logApi(action: string, metadata: Record<string, any> = {}): void {
    if (this.component !== 'api') {
      return;
    }
    
    this.info(`API: ${action}`, {
      ...metadata,
      apiAction: action
    });
  }
}

/**
 * Filter out sensitive information from headers
 */
function filterSensitiveHeaders(headers: Record<string, any>): Record<string, any> {
  const filtered = { ...headers };
  
  // Remove sensitive headers
  const sensitiveHeaders = [
    'authorization',
    'cookie',
    'x-auth-token',
    'x-api-key',
    'x-supabase-key'
  ];
  
  sensitiveHeaders.forEach(header => {
    if (filtered[header]) {
      filtered[header] = '[REDACTED]';
    }
  });
  
  return filtered;
}

/**
 * Create a logger for a specific component
 */
export function createLogger(component: string): Logger {
  return new Logger(component);
}

// Export the default logger for backward compatibility
export default createLogger('app');