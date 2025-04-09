import type { Request, Response, NextFunction } from 'express';
import { config } from '../config/index.js';

/**
 * Sets a request timeout. If the request takes longer than the configured
 * duration without sending a response, it sends a 503 Service Unavailable.
 */
export function timeoutMiddleware() {
  const timeoutMs = config().server.requestTimeout || 30000; // Default to 30 seconds if not set
  return (req: Request, res: Response, next: NextFunction) => {
    const timer = setTimeout(() => {
      if (!res.headersSent) { // Don't send error if response already started
         res.status(503).json({
             success: false,
             error: 'TimeoutError',
             message: `Request timed out after ${timeoutMs}ms`
         });
      }
      // Note: This doesn't actually stop the downstream processing,
      // it just sends the timeout response. Need cancellation logic if required.
    }, timeoutMs);

    // Clear timeout if response finishes before timeout
    res.on('finish', () => clearTimeout(timer));
    res.on('close', () => clearTimeout(timer)); // Handle client closing connection

    next();
  };
}
