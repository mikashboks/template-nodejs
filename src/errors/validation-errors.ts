import { AppError } from "./base.js";

export class ValidationError extends AppError {
    constructor(message = 'Validation failed', details?: any) {
      super(message, 400, 'ValidationError', details);
    }
  }