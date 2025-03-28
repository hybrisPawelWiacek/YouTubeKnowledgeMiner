# Logging System Guidelines

## Overview

This document provides guidelines and best practices for using the application's logging system. The logging infrastructure is built on Winston for server-side logging and a custom implementation for client-side logging that supports sending logs to the server.

## Log Levels

The system supports the following log levels (in order of increasing severity):

1. **debug** - Detailed information for debugging purposes
2. **info** - Confirmation that things are working as expected
3. **warn** - Indication that something unexpected happened, or may happen in the future
4. **error** - Runtime errors that don't require immediate action but should be monitored

## Server-Side Logging

### Basic Usage

```typescript
import { log, info, warn, error, debug } from "./utils/logger";

// Standard log levels
info('User signed in successfully', { userId: 123 });
warn('Rate limit approaching', { userId: 123, currentRate: '80%' });
error('Payment processing failed', { orderId: 'ORD-123', reason: 'Insufficient funds' });
debug('Processing step completed', { step: 2, duration: '45ms' });

// Logging errors with stack traces
try {
  // Some operation that might throw
} catch (err) {
  if (err instanceof Error) {
    logError('Operation failed', err, { additionalContext: 'value' });
  }
}
```

### Component-Specific Loggers

For better organization, create component-specific loggers:

```typescript
import { createLogger } from "../services/logger";

// Create a logger for a specific component
const paymentLogger = createLogger('payment');

paymentLogger.info('Processing payment', { amount: 99.99 });
paymentLogger.error('Transaction declined', { reason: 'Invalid card' });
```

### HTTP Request Logging

HTTP requests and responses are automatically logged by the `httpLoggerMiddleware`. Each request receives a unique request ID that is included in all related logs.

## Client-Side Logging

### Basic Usage

```typescript
import { logger } from "@/lib/logger";

// Standard log levels
logger.info('Page loaded', { page: 'home' });
logger.warn('Form submission slow', { duration: '2.5s' });
logger.error('API request failed', { endpoint: '/api/data', status: 404 });

// Logging errors with stack traces
try {
  // Some operation that might throw
} catch (err) {
  if (err instanceof Error) {
    logger.logError('Operation failed', err, { additionalContext: 'value' });
  }
}
```

### Log Synchronization

Client logs are automatically sent to the server in batches. Logs are synced:

1. When the batch size (default: 10) is reached
2. Immediately for error-level logs
3. Every 30 seconds
4. When the user navigates away from the page

## Log Structure

All logs include:

- **timestamp** - When the log was created
- **level** - The log level
- **message** - The main log message
- **component** - Which component/module generated the log
- **metadata** - Additional contextual information

## Performance and Error Monitoring

The system automatically logs:

1. Request performance metrics (duration, memory usage)
2. System metrics (CPU, memory, load averages)
3. Unhandled exceptions and promise rejections
4. HTTP error responses

## Best Practices

1. **Be Descriptive** - Log messages should be clear and descriptive
2. **Include Context** - Add relevant metadata to facilitate troubleshooting
3. **Choose Appropriate Levels**:
   - `debug` - For development details
   - `info` - For operational events
   - `warn` - For potential issues
   - `error` - For definite problems
4. **Sensitive Data** - Never log sensitive information like passwords, tokens, or personal data
5. **Performance Impact** - Be mindful of excessive logging in performance-critical sections

## Log Storage and Rotation

Logs are stored in the `logs` directory and are categorized by:

1. Component-specific logs (e.g., `http.log`, `auth.log`)
2. Severity-based logs (e.g., `errors.log`)
3. Daily combined logs (e.g., `combined-2025-03-28.log`)

## Viewing Logs

### Development Environment

In development, logs are displayed in the console with color-coding by level.

### Production Environment

In production, logs are stored in files. For real-time monitoring of production logs, additional tools like log aggregation services would be required.

---

For questions or improvements to the logging system, contact the development team.