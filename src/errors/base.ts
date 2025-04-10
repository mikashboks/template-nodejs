export class BaseError extends Error {
  statusCode: number;
  errorType: string;
  details?: any;
  override cause?: Error | undefined;

  constructor(
    message: string,
    statusCode = 500,
    errorType = 'AppError',
    details?: any,
    cause?: Error,
  ) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.errorType = errorType;
    this.details = details;
    this.cause = cause;

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

export class AbortError extends BaseError {
  constructor(message = 'Operation aborted', details?: any) {
    super(message, 499, 'AbortError', details);
  }
}

export class ExternalServiceError extends BaseError {
  constructor(message = 'Operation aborted', details?: any) {
    super(message, 499, 'AbortError', details);
  }
}

/**
 * Error for retryable operations
 */
export class RetryableError extends Error {
  constructor(
    message: string,
    public status?: number,
  ) {
    super(message);
    this.name = 'RetryableError';
  }
}
