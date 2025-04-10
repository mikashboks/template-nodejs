import { logger } from '../libs/logger.js';

import type { Request, Response, NextFunction } from 'express';

export const tracingMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const traceHeader = req.header('x-cloud-trace-context');

  if (!traceHeader) {
    logger.info('No trace header found, generating a new trace ID');
    return next();
  }

  if (traceHeader) {
    // Set environment variable for child loggers to use
    // Set environment variable for child loggers to use
    process.env['TRACE_HEADER'] = traceHeader;
  }
  next();
};
