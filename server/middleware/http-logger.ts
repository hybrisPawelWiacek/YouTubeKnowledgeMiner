/**
 * HTTP Request Logging Middleware
 * 
 * This middleware logs incoming HTTP requests and their responses,
 * including timing information and request details.
 */

import { Request, Response, NextFunction } from 'express';
import { createLogger } from '../services/logger';
import { v4 as uuidv4 } from 'uuid';

const httpLogger = createLogger('http');

/**
 * Middleware to log HTTP requests and responses
 */
export function httpLoggerMiddleware(req: Request, res: Response, next: NextFunction) {
  // Add request ID for correlation
  const requestId = uuidv4();
  (req as any).id = requestId;

  // Record start time
  const startTime = process.hrtime();

  // Log the request
  httpLogger.info(`${req.method} ${req.path}`, {
    requestId,
    method: req.method,
    path: req.path,
    query: req.query,
    ip: req.ip,
    userAgent: req.get('user-agent')
  });

  // Track response
  const originalSend = res.send;
  res.send = function(this: Response, body: any) {
    // Call original send
    return originalSend.call(this, body);
  } as any;

  // Log when response completes
  res.on('finish', () => {
    // Calculate duration
    const hrTime = process.hrtime(startTime);
    const durationMs = hrTime[0] * 1000 + hrTime[1] / 1000000;

    // Log response info
    httpLogger.info(`${res.statusCode} ${req.method} ${req.path} (${durationMs.toFixed(2)}ms)`, {
      requestId,
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration: durationMs
    });
  });

  next();
}

// Add request ID property to Express Request
declare global {
  namespace Express {
    interface Request {
      id?: string;
    }
  }
}

export default httpLoggerMiddleware;