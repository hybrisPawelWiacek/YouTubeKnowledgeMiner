/**
 * Validation Middleware
 * 
 * This middleware validates request data against Zod schemas.
 * It is used to ensure that incoming API requests contain properly formatted data.
 */

import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';
import { createLogger } from '../services/logger';
import { apiValidationError } from '../utils/response.utils';

const logger = createLogger('validation');

/**
 * Formats Zod validation errors into a more user-friendly structure
 * @param error The Zod error to format
 * @returns Object with field names as keys and error messages as values
 */
export function formatZodErrors(error: ZodError): Record<string, string> {
  const formattedErrors: Record<string, string> = {};
  
  error.errors.forEach((err) => {
    // Handle array paths (like items[0].name)
    const path = err.path.join('.');
    formattedErrors[path || 'general'] = err.message;
  });
  
  return formattedErrors;
}

/**
 * Middleware factory that validates request body against a Zod schema
 * @param schema The Zod schema to validate against
 * @returns Middleware function that validates the request body
 */
export function validateBody<T>(schema: ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      // Parse and validate the request body
      const validData = schema.parse(req.body);
      
      // Replace request body with validated and transformed data
      req.body = validData;
      
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        logger.warn('Request body validation failed', {
          path: req.path,
          errors: error.errors
        });
        
        const formattedErrors = formatZodErrors(error);
        return apiValidationError(res, formattedErrors, 'Request body validation failed');
      }
      
      // Pass other errors to the error handler
      next(error);
    }
  };
}

/**
 * Middleware factory that validates request query parameters against a Zod schema
 * @param schema The Zod schema to validate against
 * @returns Middleware function that validates the request query
 */
export function validateQuery<T>(schema: ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      // Parse and validate the query parameters
      const validData = schema.parse(req.query);
      
      // Replace query with validated and transformed data
      req.query = validData as any;
      
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        logger.warn('Request query validation failed', {
          path: req.path,
          errors: error.errors
        });
        
        const formattedErrors = formatZodErrors(error);
        return apiValidationError(res, formattedErrors, 'Query parameter validation failed');
      }
      
      // Pass other errors to the error handler
      next(error);
    }
  };
}

/**
 * Middleware factory that validates request parameters against a Zod schema
 * @param schema The Zod schema to validate against
 * @returns Middleware function that validates the request parameters
 */
export function validateParams<T>(schema: ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      // Parse and validate the route parameters
      const validData = schema.parse(req.params);
      
      // Replace params with validated and transformed data
      req.params = validData as any;
      
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        logger.warn('Request params validation failed', {
          path: req.path,
          errors: error.errors
        });
        
        const formattedErrors = formatZodErrors(error);
        return apiValidationError(res, formattedErrors, 'Path parameter validation failed');
      }
      
      // Pass other errors to the error handler
      next(error);
    }
  };
}

/**
 * Validates request files (for multipart/form-data uploads)
 * @param allowedTypes Array of allowed MIME types
 * @param maxSize Maximum file size in bytes
 * @returns Middleware function that validates the uploaded files
 */
export function validateFiles(allowedTypes: string[], maxSize: number = 5 * 1024 * 1024) {
  return (req: Request, res: Response, next: NextFunction) => {
    // Skip if no files
    if (!req.files) {
      return next();
    }
    
    const files = Array.isArray(req.files) ? req.files : Object.values(req.files).flat();
    const errors: Record<string, string> = {};
    
    files.forEach((file: any) => {
      // Check file size
      if (file.size > maxSize) {
        errors[file.fieldname] = `File ${file.originalname} exceeds maximum size of ${maxSize / 1024 / 1024}MB`;
      }
      
      // Check file type
      if (!allowedTypes.includes(file.mimetype)) {
        errors[file.fieldname] = `File ${file.originalname} has invalid type. Allowed types: ${allowedTypes.join(', ')}`;
      }
    });
    
    if (Object.keys(errors).length > 0) {
      logger.warn('File validation failed', { errors });
      return apiValidationError(res, errors, 'File validation failed');
    }
    
    next();
  };
}

export default {
  validateBody,
  validateQuery,
  validateParams,
  validateFiles,
  formatZodErrors
};