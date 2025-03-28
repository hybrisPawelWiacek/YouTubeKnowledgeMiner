/**
 * Performance Monitoring Middleware
 * 
 * This middleware tracks performance metrics for each request
 * and periodically logs system-wide metrics.
 */

import os from 'os';
import { Request, Response, NextFunction } from 'express';
import { createLogger } from '../services/logger';
import { v4 as uuidv4 } from 'uuid';

const perfLogger = createLogger('performance');
let metricIntervalId: NodeJS.Timeout | null = null;

// Configuration
const SLOW_REQUEST_THRESHOLD = 1000; // 1 second
const HIGH_MEMORY_USAGE_THRESHOLD = 10 * 1024 * 1024; // 10 MB
const SYSTEM_METRICS_INTERVAL = 5 * 60 * 1000; // 5 minutes

/**
 * Start collecting system-wide metrics periodically
 */
export function startSystemMetricsCollection() {
  if (metricIntervalId) {
    clearInterval(metricIntervalId);
  }
  
  // Log initial metrics
  logSystemMetrics();
  
  // Schedule periodic logging
  metricIntervalId = setInterval(logSystemMetrics, SYSTEM_METRICS_INTERVAL);
}

/**
 * Log current system metrics
 */
function logSystemMetrics() {
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;
  const percentUsed = (usedMem / totalMem * 100).toFixed(2);
  
  perfLogger.info('System metrics', {
    system: {
      memory: {
        total: formatBytes(totalMem),
        free: formatBytes(freeMem),
        used: formatBytes(usedMem),
        percentUsed: `${percentUsed}%`
      },
      cpu: {
        loadAvg: os.loadavg(),
        cpus: os.cpus().length
      },
      uptime: formatUptime(os.uptime())
    }
  });
}

/**
 * Format bytes to a human-readable string
 */
function formatBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = bytes;
  let unitIndex = 0;
  
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  
  return `${size.toFixed(2)} ${units[unitIndex]}`;
}

/**
 * Format seconds to a human-readable uptime string
 */
function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  
  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0 || days > 0) parts.push(`${hours}h`);
  parts.push(`${minutes}m`);
  parts.push(`${Math.floor(seconds % 60)}s`);
  
  return parts.join(' ');
}

/**
 * Performance monitoring middleware
 */
export function performanceMonitorMiddleware(req: Request, res: Response, next: NextFunction) {
  // Generate unique ID for this request if not already present
  const requestId = (req as any).id || uuidv4();
  (req as any).id = requestId;
  
  // Capture memory usage at start
  const startMem = process.memoryUsage();
  
  // Capture start time
  const startTime = process.hrtime();
  
  // Track response
  res.on('finish', () => {
    // Calculate duration
    const hrTime = process.hrtime(startTime);
    const durationMs = hrTime[0] * 1000 + hrTime[1] / 1000000;
    
    // Calculate memory difference
    const endMem = process.memoryUsage();
    const memDiff = endMem.heapUsed - startMem.heapUsed;
    
    // Prepare performance data
    const perfData = {
      request: {
        method: req.method,
        path: req.path,
        query: Object.keys(req.query).length > 0
      },
      response: {
        statusCode: res.statusCode
      },
      performance: {
        duration: `${durationMs.toFixed(2)}ms`,
        durationRaw: durationMs,
        memory: {
          start: formatBytes(startMem.heapUsed),
          end: formatBytes(endMem.heapUsed),
          diff: formatBytes(memDiff),
          diffRaw: memDiff
        }
      }
    };
    
    // Log slow requests with a warning
    if (durationMs > SLOW_REQUEST_THRESHOLD) {
      perfLogger.warn(`Slow response: ${durationMs.toFixed(2)}ms`, perfData);
    }
    
    // Log high memory usage with a warning
    if (memDiff > HIGH_MEMORY_USAGE_THRESHOLD) {
      perfLogger.warn(`High memory usage: ${formatBytes(memDiff)}`, perfData);
    }
    
    // Always log performance data at debug level
    perfLogger.debug(`Request completed: ${durationMs.toFixed(2)}ms`, perfData);
  });
  
  next();
}

export default performanceMonitorMiddleware;