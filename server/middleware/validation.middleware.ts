import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';

/**
 * Simple validation middleware alias for body validation
 * 
 * @param schema The Zod schema to validate against
 * @returns Express middleware function
 */
export function validate<T>(schema: ZodSchema<T>) {
  return validateRequest(schema, 'body');
}

/**
 * Generic validation middleware for validating request data against a Zod schema
 * 
 * @param schema The Zod schema to validate against
 * @param source The source of data to validate ('body', 'query', or 'params')
 * @returns Express middleware function
 */
export function validateRequest<T>(schema: ZodSchema<T>, source: 'body' | 'query' | 'params' = 'body') {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      // Convert query parameters to appropriate types if needed
      let dataToValidate = req[source];
      
      if (source === 'query') {
        // Parse query parameters
        dataToValidate = parseQueryParams(req.query);
      }
      
      // Validate with Zod
      const validatedData = schema.parse(dataToValidate);
      
      // Attach validated data to request
      req[source] = validatedData;
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      next(error);
    }
  };
}

/**
 * Helper function to parse query parameters from strings to appropriate types
 * 
 * @param query The original query object from Express
 * @returns Parsed query object with converted types
 */
function parseQueryParams(query: any) {
  const parsedQuery = { ...query };
  
  // Convert numeric parameters
  if (parsedQuery.category_id) parsedQuery.category_id = Number(parsedQuery.category_id);
  if (parsedQuery.collection_id) parsedQuery.collection_id = Number(parsedQuery.collection_id);
  if (parsedQuery.rating_min) parsedQuery.rating_min = Number(parsedQuery.rating_min);
  if (parsedQuery.rating_max) parsedQuery.rating_max = Number(parsedQuery.rating_max);
  if (parsedQuery.page) parsedQuery.page = Number(parsedQuery.page);
  if (parsedQuery.limit) parsedQuery.limit = Number(parsedQuery.limit);
  if (parsedQuery.cursor) parsedQuery.cursor = Number(parsedQuery.cursor);
  
  // Convert boolean parameters
  if (parsedQuery.is_favorite === 'true') parsedQuery.is_favorite = true;
  if (parsedQuery.is_favorite === 'false') parsedQuery.is_favorite = false;
  
  return parsedQuery;
}

/**
 * Middleware to validate and parse numeric route parameters
 * For example, to validate :id parameters in /api/videos/:id
 * 
 * @param paramName The name of the parameter to validate
 * @returns Express middleware function
 */
export function validateNumericParam(paramName: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const paramValue = req.params[paramName];
    const numericValue = parseInt(paramValue, 10);
    
    if (isNaN(numericValue)) {
      return res.status(400).json({ 
        message: `Invalid ${paramName} parameter: must be a number` 
      });
    }
    
    // Update the parameter with the numeric value
    req.params[paramName] = numericValue.toString();
    next();
  };
}