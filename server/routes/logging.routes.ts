/**
 * Logging Routes
 * 
 * This file contains routes for managing and accessing logs from the application.
 * It provides endpoints for retrieving, filtering, and searching logs.
 */

import { Router, Request, Response, NextFunction } from 'express';
import { logger, logAuthEvent } from '../utils/logger';
import { requireAuth } from '../middleware/auth.middleware';
import fs from 'fs';
import path from 'path';
import { sendSuccess, sendError } from '../utils/response.utils';
import { z } from 'zod';

const router = Router();
const logsDir = path.join(process.cwd(), 'logs');

/**
 * @route GET /api/logs
 * @description Get application logs with filtering
 * @access Private (admin only, allow dev_access=true for testing)
 */
router.get('/', (req: Request, res: Response, next: NextFunction) => {
  // Check for dev_access query parameter for testing
  if (req.query.dev_access === 'true') {
    return next();
  }
  return requireAuth(req, res, next);
}, async (req: Request, res: Response) => {
  try {
    const { 
      level = 'info',
      logFile = 'combined',
      date = new Date().toISOString().split('T')[0], // Today's date in YYYY-MM-DD format
      limit = 100,
      offset = 0,
      search = '',
    } = req.query;
    
    // Validate log level
    const validLevels = ['error', 'warn', 'info', 'debug'];
    if (level && !validLevels.includes(level.toString())) {
      return sendError(res, 'Invalid log level', 400);
    }
    
    // Validate log file type
    const validLogFiles = ['combined', 'error', 'api', 'auth'];
    if (logFile && !validLogFiles.includes(logFile.toString())) {
      return sendError(res, 'Invalid log file type', 400);
    }
    
    // Construct the log file path
    const logFileName = `${logFile}-${date}.log`;
    const logFilePath = path.join(logsDir, logFileName);
    
    // Check if the log file exists
    if (!fs.existsSync(logFilePath)) {
      return sendError(res, `Log file ${logFileName} not found`, 404);
    }
    
    // Read the log file
    const logContents = fs.readFileSync(logFilePath, 'utf8');
    
    // Split by newline and parse each line as JSON
    const logLines = logContents.split('\n')
      .filter(line => line.trim() !== '') // Remove empty lines
      .map(line => {
        try {
          return JSON.parse(line);
        } catch (err) {
          // If the line is not valid JSON, return it as-is
          return { raw: line };
        }
      });
    
    // Filter logs based on level
    const levelFilteredLogs = logLines.filter(log => {
      // For non-JSON lines, skip level filtering
      if (log.raw) return true;
      
      // Get the log level (might be in different places depending on the logger)
      const logLevel = log.level || '';
      
      // Compare log level with requested level (accounting for log level hierarchy)
      if (level === 'error') return logLevel === 'error';
      if (level === 'warn') return ['error', 'warn'].includes(logLevel);
      if (level === 'info') return ['error', 'warn', 'info'].includes(logLevel);
      if (level === 'debug') return true; // Debug includes all levels
      
      return true;
    });
    
    // Filter logs based on search query if provided
    const searchFilteredLogs = search 
      ? levelFilteredLogs.filter(log => {
          const searchTerm = search.toString().toLowerCase();
          // For non-JSON logs, search in the raw content
          if (log.raw) return log.raw.toLowerCase().includes(searchTerm);
          
          // For JSON logs, search in stringified version to include all fields
          return JSON.stringify(log).toLowerCase().includes(searchTerm);
        })
      : levelFilteredLogs;
    
    // Apply pagination
    const startIndex = Math.max(0, parseInt(offset.toString()));
    const endIndex = startIndex + parseInt(limit.toString());
    const paginatedLogs = searchFilteredLogs.slice(startIndex, endIndex);
    
    // Return the paginated logs with metadata
    return sendSuccess(res, {
      logs: paginatedLogs,
      totalCount: searchFilteredLogs.length,
      offset: startIndex,
      limit: parseInt(limit.toString()),
      hasMore: endIndex < searchFilteredLogs.length,
    });
  } catch (error) {
    logger.error('Error retrieving logs', {
      error,
      requestId: req.requestId,
    });
    return sendError(res, 'Failed to retrieve logs', 500);
  }
});

/**
 * @route GET /api/logs/files
 * @description Get available log files
 * @access Private (admin only, allow dev_access=true for testing)
 */
router.get('/files', (req: Request, res: Response, next: NextFunction) => {
  // Check for dev_access query parameter for testing
  if (req.query.dev_access === 'true') {
    return next();
  }
  return requireAuth(req, res, next);
}, (req: Request, res: Response) => {
  try {
    // Read the logs directory
    const fileList = fs.readdirSync(logsDir);
    
    // Group files by type and date
    const logFiles = fileList.reduce((acc: any, file: string) => {
      // Parse the file name to extract type and date
      const match = file.match(/^(.*)-(\d{4}-\d{2}-\d{2})\.log$/);
      if (!match) return acc;
      
      const [_, type, date] = match;
      
      if (!acc[type]) {
        acc[type] = [];
      }
      
      // Get file stats to include size and modification time
      const stats = fs.statSync(path.join(logsDir, file));
      
      acc[type].push({
        name: file,
        date,
        size: stats.size,
        sizeFormatted: formatBytes(stats.size),
        modifiedAt: stats.mtime.toISOString(),
      });
      
      return acc;
    }, {});
    
    return sendSuccess(res, { logFiles });
  } catch (error) {
    logger.error('Error retrieving log files', {
      error,
      requestId: req.requestId,
    });
    return sendError(res, 'Failed to retrieve log files', 500);
  }
});

/**
 * @route GET /api/logs/:requestId
 * @description Get all logs for a specific request ID
 * @access Private (admin only, allow dev_access=true for testing)
 */
router.get('/:requestId', (req: Request, res: Response, next: NextFunction) => {
  // Check for dev_access query parameter for testing
  if (req.query.dev_access === 'true') {
    return next();
  }
  return requireAuth(req, res, next);
}, (req: Request, res: Response) => {
  try {
    const { requestId } = req.params;
    
    if (!requestId) {
      return sendError(res, 'Request ID is required', 400);
    }
    
    // Read the logs directory
    const fileList = fs.readdirSync(logsDir);
    
    // Get today's date for more efficient searching
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    
    // Collect all logs for the request ID
    const requestLogs: any[] = [];
    
    // First check today's logs (most common case)
    const todayLogFiles = fileList.filter(file => file.includes(today));
    
    // Then check all other log files (starting with newest)
    const otherLogFiles = fileList
      .filter(file => !file.includes(today))
      .sort((a, b) => {
        const dateA = a.match(/\d{4}-\d{2}-\d{2}/)?.[0] || '';
        const dateB = b.match(/\d{4}-\d{2}-\d{2}/)?.[0] || '';
        return dateB.localeCompare(dateA); // Sort descending (newest first)
      });
    
    // Combine the log files with today's logs first
    const sortedLogFiles = [...todayLogFiles, ...otherLogFiles];
    
    // Search each file for the request ID
    for (const file of sortedLogFiles) {
      const filePath = path.join(logsDir, file);
      let fileContents;
      
      try {
        fileContents = fs.readFileSync(filePath, 'utf8');
      } catch (err) {
        logger.warn(`Failed to read log file: ${file}`, { error: err });
        continue;
      }
      
      // First do a quick check if the file contains the request ID at all
      if (!fileContents.includes(requestId)) {
        continue;
      }

      const lines = fileContents.split('\n').filter(line => line.trim() !== '');
      let foundLogs = false;
      
      for (const line of lines) {
        // Check if the line contains the request ID before further processing
        if (line.includes(requestId)) {
          // Try to extract timestamp and log level from the line using regex
          const timestampMatch = line.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)/);
          const timestamp = timestampMatch ? timestampMatch[1] : null;
          
          // Try to determine log level
          let level = 'info'; // Default level
          if (line.includes('error')) level = 'error';
          else if (line.includes('warn')) level = 'warn';
          else if (line.includes('debug')) level = 'debug';
          
          // Store the log entry with extracted metadata
          const logEntry = {
            raw: line,
            timestamp,
            level,
            _file: file,
          };
          
          requestLogs.push(logEntry);
          foundLogs = true;
        }
      }
      
      // If we found logs in this file and have a reasonable number, stop searching
      if (foundLogs && requestLogs.length >= 5) {
        break;
      }
    }
    
    // Sort the logs by timestamp
    requestLogs.sort((a, b) => {
      const timestampA = a.timestamp || '';
      const timestampB = b.timestamp || '';
      return timestampA.localeCompare(timestampB);
    });
    
    if (requestLogs.length === 0) {
      return sendError(res, `No logs found for request ID: ${requestId}`, 404);
    }
    
    return sendSuccess(res, { logs: requestLogs });
  } catch (error) {
    logger.error('Error retrieving logs for request ID', {
      error,
      requestId: req.requestId,
      searchRequestId: req.params.requestId,
    });
    return sendError(res, 'Failed to retrieve logs for request ID', 500);
  }
});

/**
 * @route POST /api/log/auth
 * @description Endpoint to receive client-side auth events and log them
 * @access Public (accessible to unauthenticated clients)
 */
const clientAuthEventSchema = z.object({
  event: z.string(),
  userId: z.union([z.number(), z.string(), z.undefined()]).optional(),
  details: z.any().optional(),
  clientTimestamp: z.string().optional(),
  userAgent: z.string().optional(),
  location: z.string().optional()
});

router.post('/auth', (req: Request, res: Response) => {
  try {
    // Extract request ID from headers
    const requestId = req.headers['x-request-id'] as string || req.requestId || '';
    
    // Validate the request body
    const eventData = clientAuthEventSchema.parse(req.body);
    
    // Log the auth event using the server-side logging function
    logAuthEvent(
      requestId,
      eventData.event,
      eventData.userId,
      {
        ...eventData.details,
        clientTimestamp: eventData.clientTimestamp,
        userAgent: eventData.userAgent,
        location: eventData.location,
        ip: req.ip || req.headers['x-forwarded-for'] || 'unknown'
      }
    );
    
    // Send a success response
    return res.status(201).json({ success: true });
  } catch (error) {
    logger.error('Error logging auth event from client', {
      error,
      requestId: req.requestId,
      body: req.body
    });
    
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid request format',
        errors: error.errors
      });
    }
    
    // Still return success to avoid client-side errors
    // The logging error has been recorded server-side
    return res.status(201).json({ success: true });
  }
});

/**
 * Format bytes to human-readable format
 */
function formatBytes(bytes: number, decimals = 2) {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
  
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

export default router;