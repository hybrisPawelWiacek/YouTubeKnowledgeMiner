/**
 * HTTP Logger Middleware
 * 
 * This middleware logs all HTTP requests in a structured format,
 * capturing important information like request method, path, query parameters,
 * response status, and timing.
 */

import { Request, Response, NextFunction } from 'express';
import { createLogger } from '../services/logger';
import { v4 as uuidv4 } from 'uuid';

const httpLogger = createLogger('http');

/**
 * HTTP logging middleware
 * Logs all HTTP requests with request and response details
 */
export function httpLoggerMiddleware(req: Request, res: Response, next: NextFunction) {
  // Generate a unique ID for this request if not already present
  const requestId = (req as any).id || uuidv4();
  (req as any).id = requestId;
  
  // Capture start time
  const startTime = process.hrtime();
  
  // Log the request
  httpLogger.info(`${req.method} ${req.path}`, {
    requestId,
    method: req.method,
    path: req.path,
    query: req.query,
    ip: req.ip,
    userAgent: req.headers['user-agent']
  });
  
  // The original URL can contain sensitive data, so we only log the path and query
  
  // Log the response
  res.on('finish', () => {
    // Calculate duration
    const hrTime = process.hrtime(startTime);
    const durationMs = hrTime[0] * 1000 + hrTime[1] / 1000000;
    
    // Log response details
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

export default httpLoggerMiddleware;