// src/errors/http-errors.ts
import { BaseError } from './base.js';

export class NotFoundError extends BaseError {
  constructor(message = 'Resource not found', details?: any) {
    super(message, 404, 'NotFoundError', details);
  }
}

export class UnauthorizedError extends BaseError {
  constructor(message = 'Unauthorized', details?: any) {
    super(message, 401, 'UnauthorizedError', details);
  }
}

export class ForbiddenError extends BaseError {
  constructor(message = 'Forbidden', details?: any) {
    super(message, 403, 'ForbiddenError', details);
  }
}

export class ConflictError extends BaseError {
  constructor(message = 'Resource conflict', details?: any) {
    super(message, 409, 'ConflictError', details);
  }
}
export class BadRequestError extends BaseError {
  constructor(message = 'Bad request', details?: any) {
    super(message, 400, 'BadRequestError', details);
  }
}
export class InternalServerError extends BaseError {
  constructor(message = 'Internal server error', details?: any) {
    super(message, 500, 'InternalServerError', details);
  }
}
export class ServiceUnavailableError extends BaseError {
  constructor(message = 'Service unavailable', details?: any) {
    super(message, 503, 'ServiceUnavailableError', details);
  }
}
export class NotImplementedError extends BaseError {
  constructor(message = 'Not implemented', details?: any) {
    super(message, 501, 'NotImplementedError', details);
  }
}

export class TimeoutError extends BaseError {
  constructor(message = 'Operation timed out', details?: any) {
    super(message, 408, 'TimeoutError', details);
  }
}