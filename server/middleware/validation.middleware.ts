/**
 * Validation Middleware
 * 
 * This middleware validates request data against Zod schemas.
 * It is used to ensure that incoming API requests contain properly formatted data.
 */

import { Request, Response, NextFunction } from 'express';
import { z, ZodSchema, ZodError } from 'zod';
import { createLogger } from '../services/logger';
import { apiValidationError, apiError } from '../utils/response.utils';

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

/**
 * Middleware to validate numeric parameters
 * Ensures URL parameters that should be numbers are valid
 * @param paramName Name of the parameter to validate
 */
export function validateNumericParam(paramName: string = 'id') {
  return (req: Request, res: Response, next: NextFunction) => {
    const value = req.params[paramName];
    
    if (!value || isNaN(parseInt(value, 10))) {
      logger.warn(`Invalid numeric parameter: ${paramName}`, {
        path: req.path,
        paramValue: value
      });
      
      return apiError(
        res,
        `Invalid ${paramName} parameter. Expected a number.`,
        'INVALID_PARAMETER',
        400
      );
    }
    
    // Convert to number in params
    req.params[paramName] = parseInt(value, 10).toString();
    
    next();
  };
}

/**
 * Generic request validation middleware
 * Works with any combination of body, query, or params validation
 * @param options Validation options including schemas for different parts of the request
 */
export function validateRequest(options: {
  body?: ZodSchema<any>;
  query?: ZodSchema<any>;
  params?: ZodSchema<any>;
}) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Validate each part of the request that has a schema
      const validationResults: Record<string, any> = {};
      const errors: Record<string, Record<string, string>> = {};
      
      // Validate request body if schema provided
      if (options.body) {
        try {
          validationResults.body = options.body.parse(req.body);
        } catch (error) {
          if (error instanceof ZodError) {
            errors.body = formatZodErrors(error);
          } else {
            next(error);
            return;
          }
        }
      }
      
      // Validate query params if schema provided
      if (options.query) {
        try {
          validationResults.query = options.query.parse(req.query);
        } catch (error) {
          if (error instanceof ZodError) {
            errors.query = formatZodErrors(error);
          } else {
            next(error);
            return;
          }
        }
      }
      
      // Validate route params if schema provided
      if (options.params) {
        try {
          validationResults.params = options.params.parse(req.params);
        } catch (error) {
          if (error instanceof ZodError) {
            errors.params = formatZodErrors(error);
          } else {
            next(error);
            return;
          }
        }
      }
      
      // If there are any validation errors, return them
      if (Object.keys(errors).length > 0) {
        logger.warn('Request validation failed', {
          path: req.path,
          errors
        });
        
        return apiValidationError(res, errors, 'Request validation failed');
      }
      
      // Update request objects with validated data
      if (validationResults.body) {
        req.body = validationResults.body;
      }
      
      if (validationResults.query) {
        req.query = validationResults.query;
      }
      
      if (validationResults.params) {
        req.params = validationResults.params;
      }
      
      next();
    } catch (error) {
      // Handle any unexpected errors
      logger.error('Unexpected error in request validation', {
        error: error instanceof Error ? error.message : String(error)
      });
      
      next(error);
    }
  };
}

export default {
  validateBody,
  validateQuery,
  validateParams,
  validateFiles,
  formatZodErrors,
  validateNumericParam,
  validateRequest
};