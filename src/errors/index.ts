import {
  PrismaClientKnownRequestError,
  PrismaClientValidationError,
  PrismaClientRustPanicError,
} from '@prisma/client/runtime/library';
import { ZodError } from 'zod';

import { BaseError } from './base.js';
import { DatabaseError } from './database-errors.js';
import {
  ConflictError,
  NotFoundError,
  TimeoutError,
  UnauthorizedError,
} from './http-errors.js';
import { ValidationError } from './validation-errors.js';

// Re-export all error classes from their respective files
export * from './base.js';
export * from './http-errors.js';
export * from './database-errors.js';
export * from './validation-errors.js';

/**
 * Converts various error types to a standardized AppError
 * This helps ensure consistent error handling throughout the application
 *
 * @param err - Any error thrown in the application
 * @returns An AppError instance with appropriate status code and details
 */
export function normalizeError(err: unknown): BaseError {
  // Handle null or undefined
  if (err === null || err === undefined) {
    return new BaseError('Unknown error occurred', 500, 'UnknownError');
  }

  // Already an AppError
  if (err instanceof BaseError) {
    return err;
  }

  // Convert to any for type checking of properties
  const error = err as any;

  // Zod validation errors
  if (error instanceof ZodError) {
    return new ValidationError('Validation failed', error.format());
  }

  // Handle Prisma errors
  if (error instanceof PrismaClientKnownRequestError) {
    // Map common Prisma error codes to appropriate HTTP status codes
    switch (error.code) {
      case 'P2002': // Unique constraint failed
        return new ConflictError('Resource already exists', {
          fields: error.meta?.['target'] || 'unknown field',
        });

      case 'P2025': // Record not found
        return new NotFoundError('Resource not found');

      case 'P2003': // Foreign key constraint failed
        return new ValidationError('Invalid relationship reference', {
          fields: error.meta?.['field_name'] || 'unknown field',
        });

      case 'P2001': // Record does not exist
        return new NotFoundError('Resource not found');

      case 'P1001': // Database connection error
      case 'P1002': // Database connection error
        return new DatabaseError('Database connection failed', error);

      case 'P1008': // Operation timed out
        return new TimeoutError('Database operation timed out', {
          code: error.code,
        });

      default:
        return new DatabaseError(`Database error: ${error.code}`, error);
    }
  }

  if (error instanceof PrismaClientValidationError) {
    return new ValidationError('Invalid database query', {
      message: error.message,
    });
  }

  if (error instanceof PrismaClientRustPanicError) {
    return new DatabaseError('Critical database error', error);
  }

  // Handle Express body-parser errors
  if (error.type === 'entity.too.large') {
    return new ValidationError('Request payload too large', {
      limit: error.limit,
    });
  }

  if (error.type === 'entity.parse.failed') {
    return new ValidationError('Invalid JSON in request body');
  }

  // Handle JWT errors from auth middleware
  if (error.name === 'JsonWebTokenError') {
    return new UnauthorizedError('Invalid token');
  }

  if (error.name === 'TokenExpiredError') {
    return new UnauthorizedError('Token expired');
  }

  // Handle timeouts/aborts
  if (error.name === 'AbortError' || error.code === 'ETIMEDOUT') {
    return new TimeoutError('Request timed out');
  }

  // Generic network errors
  if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
    return new DatabaseError('Failed to connect to external service', error);
  }

  // Get the error message
  const message =
    typeof error.message === 'string'
      ? error.message
      : 'An unexpected error occurred';

  // Get the error status code if available
  const statusCode =
    typeof error.statusCode === 'number'
      ? error.statusCode
      : typeof error.status === 'number'
        ? error.status
        : 500;

  // Get error type/name if available
  const errorType =
    typeof error.name === 'string' ? error.name : 'UnknownError';

  // Handle any other error as a generic error
  return new BaseError(
    message,
    statusCode,
    errorType,
    error.details || undefined,
    error instanceof Error ? error : new Error(message),
  );
}

/**
 * Determines the appropriate log level based on HTTP status code
 *
 * @param statusCode - HTTP status code
 * @returns The log level to use ('error', 'warn', or 'info')
 */
export function getLogLevel(statusCode: number): 'error' | 'warn' | 'info' {
  if (statusCode >= 500) return 'error';
  if (statusCode >= 400) return 'warn';
  return 'info';
}
