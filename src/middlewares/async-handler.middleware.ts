// src/middleware/async-handler.middleware.ts
// src/middleware/async-handler.middleware.ts
import type { Request, Response, NextFunction } from 'express';

/**
 * Wrapper for async route handlers to catch errors
 * This eliminates the need for try/catch blocks in every async route handler
 * 
 * @param fn - The async route handler function
 * @returns A wrapped function that forwards errors to Express error handling
 */
export function asyncHandler(fn: Function) {
  return (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}