// src/middleware/errorHandler.ts
import { config } from '../config/index.js';
import { normalizeError, getLogLevel } from '../errors/index.js';
import { logger } from '../libs/logger.js';

import type { Request, Response, NextFunction } from 'express';

/**
 * Comprehensive global error handling middleware.
 * Catches and normalizes errors passed via next(error).
 * Structured for optimal use in Cloud Run and modern logging setups.
 */
export function errorHandlerMiddleware(
  err: unknown,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  next: NextFunction,
): void {
  try {
    const appConfig = config;
    const reqLogger = (req as any).log || logger;
    const requestId = (req as any).id || 'unknown';

    const normalizedError = normalizeError(err);

    const { statusCode, message, errorType, details, cause, stack } =
      normalizedError;

    const traceHeader = req.header('X-Cloud-Trace-Context');
    const traceId = traceHeader?.split('/')[0];

    const logLevel = getLogLevel(statusCode);

    const logContext = {
      err: normalizedError,
      statusCode,
      errorType,
      requestId,
      path: req.path,
      method: req.method,
      ip: req.ip,
      userId: (req as any).user?.id,
      service: appConfig.server.isCloudRun ? appConfig.gcp?.service : undefined,
      traceId: appConfig.logging.includeTraceId ? traceId : undefined,
      cause:
        cause instanceof Error
          ? {
              name: cause.name,
              message: cause.message,
              stack: appConfig.server.isDevelopment ? cause.stack : undefined,
            }
          : undefined,
    };

    reqLogger[logLevel](logContext, `${errorType}: ${message}`);

    res.status(statusCode).json({
      success: false,
      error: errorType,
      message,
      ...(details && (appConfig.server.isDevelopment || statusCode < 500)
        ? { details }
        : {}),
      ...(appConfig.server.isDevelopment ? { stack } : {}),
      requestId,
      timestamp: new Date().toISOString(),
    });
  } catch (handlerError) {
    logger.error({ err: handlerError }, 'Error handler failed');

    res.status(500).json({
      success: false,
      error: 'InternalServerError',
      message: 'An unexpected error occurred during error processing.',
      requestId: (req as any).id || 'unknown',
      timestamp: new Date().toISOString(),
    });
  }
}
