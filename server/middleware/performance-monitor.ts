/**
 * Performance Monitoring Middleware
 * 
 * This middleware tracks and logs performance metrics for HTTP requests,
 * including response time and memory usage. It also periodically logs
 * system-wide metrics like CPU and memory usage.
 */

import { Request, Response, NextFunction } from 'express';
import os from 'os';
import { createLogger } from '../services/logger';

// Create performance-specific logger
const perfLogger = createLogger('performance');

// Define thresholds for slow requests
const SLOW_REQUEST_THRESHOLD_MS = 1000;
const HIGH_MEMORY_USAGE_MB = 10;

/**
 * Express middleware to monitor request performance
 */
export function performanceMonitorMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
) {
  // Skip monitoring for static assets and health checks
  if (
    req.path.match(/\.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$/) ||
    req.path === '/health' ||
    req.path === '/ping'
  ) {
    return next();
  }

  // Record start time and memory usage
  const startTime = process.hrtime();
  const startMemory = process.memoryUsage();
  
  // Process the request
  next();
  
  // When response is finished, calculate and log metrics
  res.on('finish', () => {
    // Calculate duration
    const hrDuration = process.hrtime(startTime);
    const durationMs = (hrDuration[0] * 1000) + (hrDuration[1] / 1000000);
    
    // Get current memory usage
    const endMemory = process.memoryUsage();
    
    // Calculate memory difference
    const memoryDiff = endMemory.heapUsed - startMemory.heapUsed;
    
    // Format memory values for logging
    const formatMemory = (bytes: number) => {
      return (bytes / 1024 / 1024).toFixed(2) + ' MB';
    };
    
    // Determine if this was a slow request
    const isSlow = durationMs > SLOW_REQUEST_THRESHOLD_MS;
    const hasHighMemoryUsage = memoryDiff > (HIGH_MEMORY_USAGE_MB * 1024 * 1024);
    
    // Log at appropriate level
    const logLevel = isSlow || hasHighMemoryUsage ? 'warn' : 'debug';
    
    // Log request performance
    perfLogger[logLevel](`Request completed: ${durationMs.toFixed(2)}ms`, {
      request: {
        method: req.method,
        path: req.path,
        query: Object.keys(req.query).length > 0 || false
      },
      response: {
        statusCode: res.statusCode
      },
      performance: {
        duration: `${durationMs.toFixed(2)}ms`,
        durationRaw: durationMs,
        memory: {
          start: formatMemory(startMemory.heapUsed),
          end: formatMemory(endMemory.heapUsed),
          diff: formatMemory(memoryDiff),
          diffRaw: memoryDiff
        }
      }
    });
  });
}

/**
 * Collect and log system metrics periodically
 */
export function setupSystemMetricsLogging(intervalMinutes = 5) {
  // Log initial metrics
  logSystemMetrics();
  
  // Set up periodic logging
  const intervalMs = intervalMinutes * 60 * 1000;
  setInterval(logSystemMetrics, intervalMs);
}

/**
 * Log current system metrics
 */
function logSystemMetrics() {
  // Get CPU info
  const cpus = os.cpus();
  const cpuCount = cpus.length;
  const cpuModel = cpus[0].model;
  
  // Get memory info
  const totalMemory = os.totalmem();
  const freeMemory = os.freemem();
  const usedMemory = totalMemory - freeMemory;
  const memoryUsagePercent = ((usedMemory / totalMemory) * 100).toFixed(2) + '%';
  
  // Get load averages
  const loadAvg = os.loadavg();
  
  // Get system uptime
  const uptimeHours = (os.uptime() / 3600).toFixed(2);
  
  // Get process memory
  const processMemory = process.memoryUsage();
  
  // Get process uptime
  const processUptimeHours = (process.uptime() / 3600).toFixed(2);
  
  // Format memory values
  const formatMemory = (bytes: number) => {
    return (bytes / 1024 / 1024 / 1024).toFixed(2) + ' GB';
  };
  
  const formatProcessMemory = (bytes: number) => {
    return (bytes / 1024 / 1024).toFixed(2) + ' MB';
  };
  
  // Log system metrics
  perfLogger.info('System metrics collected', {
    system: {
      platform: os.platform(),
      arch: os.arch(),
      cpus: {
        count: cpuCount,
        model: cpuModel,
        speed: (cpus[0].speed / 1000) + ' GHz'
      },
      memory: {
        total: formatMemory(totalMemory),
        free: formatMemory(freeMemory),
        used: formatMemory(usedMemory),
        usagePercent: memoryUsagePercent
      },
      load: {
        '1m': loadAvg[0].toFixed(2),
        '5m': loadAvg[1].toFixed(2),
        '15m': loadAvg[2].toFixed(2)
      },
      uptime: uptimeHours + ' hours'
    },
    process: {
      memory: {
        rss: formatProcessMemory(processMemory.rss),
        heapTotal: formatProcessMemory(processMemory.heapTotal),
        heapUsed: formatProcessMemory(processMemory.heapUsed),
        external: formatProcessMemory(processMemory.external || 0)
      },
      uptime: processUptimeHours + ' hours'
    }
  });
}