import { BaseError } from './base.js';

export class ValidationError extends BaseError {
  constructor(message = 'Validation failed', details?: any) {
    super(message, 400, 'ValidationError', details);
  }
}
