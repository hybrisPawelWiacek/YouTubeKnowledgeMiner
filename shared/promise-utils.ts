/**
 * Utility functions for working with Promises
 */

/**
 * Checks if an object is Promise-like (has a .then method)
 * This is a type-safe way to check for Promise-like objects that works with TypeScript
 * 
 * @param obj Any object to check
 * @returns True if the object is Promise-like, false otherwise
 */
export const isPromiseLike = (obj: any): obj is Promise<any> => 
  obj && typeof obj === 'object' && typeof obj.then === 'function';