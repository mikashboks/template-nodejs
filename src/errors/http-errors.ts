// src/errors/http-errors.ts
import { AppError } from './base.js';

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found', details?: any) {
    super(message, 404, 'NotFoundError', details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized', details?: any) {
    super(message, 401, 'UnauthorizedError', details);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden', details?: any) {
    super(message, 403, 'ForbiddenError', details);
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Resource conflict', details?: any) {
    super(message, 409, 'ConflictError', details);
  }
}
export class BadRequestError extends AppError {
  constructor(message = 'Bad request', details?: any) {
    super(message, 400, 'BadRequestError', details);
  }
}
export class InternalServerError extends AppError {
  constructor(message = 'Internal server error', details?: any) {
    super(message, 500, 'InternalServerError', details);
  }
}
export class ServiceUnavailableError extends AppError {
  constructor(message = 'Service unavailable', details?: any) {
    super(message, 503, 'ServiceUnavailableError', details);
  }
}
export class NotImplementedError extends AppError {
  constructor(message = 'Not implemented', details?: any) {
    super(message, 501, 'NotImplementedError', details);
  }
}

export class TimeoutError extends AppError {
  constructor(message = 'Operation timed out', details?: any) {
    super(message, 408, 'TimeoutError', details);
  }
}