# Logging Guidelines

This document outlines the logging system implemented in the application and provides guidelines for its usage.

## Overview

The logging system is designed to provide comprehensive, standardized logging across the entire application, both on the server and client sides. It uses Winston on the server side and a custom implementation on the client side that sends logs to the server.

## Log Levels

The system supports four log levels, listed in order of increasing severity:

1. **debug** - Detailed information, typically of interest only when diagnosing problems
2. **info** - Confirmation that things are working as expected
3. **warn** - An indication that something unexpected happened, or may happen in the near future
4. **error** - A serious problem that requires immediate attention

## Log Files

Server logs are stored in the `/logs` directory, with separate files for different concerns:

- `combined.log` - All logs
- `error.log` - Error-level logs only
- `http.log` - HTTP request/response logs
- `auth.log` - Authentication-related logs
- `api.log` - API-related logs
- `client.log` - Logs received from the client
- `performance.log` - Performance metrics
- `exceptions.log` - Uncaught exceptions
- `rejections.log` - Unhandled promise rejections

## Server-Side Usage

### Basic Usage

```typescript
import { createLogger } from '../services/logger';

// Create a logger for a specific component
const logger = createLogger('my-component');

// Log at different levels
logger.debug('Detailed debugging information');
logger.info('Normal operational message');
logger.warn('Warning: something might be wrong');
logger.error('Error: something is definitely wrong');

// Log with additional metadata
logger.info('User registered', { userId: 123, email: 'user@example.com' });

// Log errors with stack traces
try {
  // Some code that might throw
} catch (error) {
  logger.logError('Failed to process request', error, { requestId: '123' });
}
```

### Specialized Loggers

The system includes specialized loggers for specific concerns:

```typescript
// HTTP logger (for request/response logging)
const httpLogger = createLogger('http');
httpLogger.logHttpRequest(req, { requestId: '123' });
httpLogger.logHttpResponse(req, res, durationMs, { requestId: '123' });

// Auth logger (for authentication events)
const authLogger = createLogger('auth');
authLogger.logAuth('login', { userId: 123, method: 'password' });

// API logger (for API operations)
const apiLogger = createLogger('api');
apiLogger.logApi('getVideos', { userId: 123, filters: { category: 'tech' } });
```

## Client-Side Usage

The client-side logger provides a similar interface, but batches logs and sends them to the server:

```typescript
import { createComponentLogger } from '@/lib/logger';

// Create a logger for a specific component
const logger = createComponentLogger('my-component');

// Basic logging
logger.debug('Detailed debugging information');
logger.info('Normal operational message');
logger.warn('Warning: something might be wrong');
logger.error('Error: something is definitely wrong');

// Log with metadata
logger.info('User interaction', { action: 'button_click', elementId: 'submit-btn' });

// Log errors with stack traces
try {
  // Some code that might throw
} catch (error) {
  logger.logError('Failed to load data', error, { source: 'API' });
}

// Specialized logging methods
logger.trackEvent('button_click', { elementId: 'submit-btn' });
logger.trackFeature('search', { query: 'example' });
logger.trackPerformance('api_request', 150, { endpoint: '/api/videos' });
```

## Middleware

The system includes several middleware components:

1. **HTTP Logger** - Logs all HTTP requests and responses
2. **Error Handler** - Centralizes error handling and logging
3. **Performance Monitor** - Tracks request performance and system metrics

## Best Practices

1. **Use the Right Level**
   - `debug` for information useful for debugging
   - `info` for normal operations
   - `warn` for potential issues
   - `error` for actual errors

2. **Provide Context**
   - Always include relevant metadata (e.g., user IDs, request IDs, etc.)
   - For errors, include the full error object to capture stack traces

3. **Be Concise**
   - Log messages should be clear and concise
   - Avoid logging sensitive information (passwords, tokens, etc.)

4. **Use Component Loggers**
   - Create a specific logger for each component or module
   - This helps with filtering and organization

5. **Track Important Events**
   - Authentication events (login, logout, registration)
   - Critical business operations
   - Performance metrics for key operations

## Development vs. Production

- In development, logs are sent to both the console and log files
- In production, console logging is disabled, and only file logging is active
- The default log level is `debug` in development and `info` in production

## Troubleshooting

If you're investigating an issue:

1. Check the `error.log` file first
2. Look at `http.log` for request/response details
3. Check `client.log` for client-side issues
4. Examine `performance.log` for slow operations

## Extending the System

To extend the logging system:

1. Add new log file destinations in `services/logger.ts`
2. Add new specialized logging methods as needed
3. Ensure consistent formatting and metadata across all logs

## Log Rotation and Maintenance

In production environments, implement log rotation to manage log file sizes and retention:

1. Use a tool like `logrotate` to rotate logs
2. Archive older logs
3. Set up monitoring for log disk usage

## Security Considerations

1. Logs might contain sensitive information
2. Ensure log files have appropriate permissions
3. Implement log scrubbing for sensitive fields
4. Be cautious about what is logged at what level