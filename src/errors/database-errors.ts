import { AppError } from './base.js';

export class DatabaseError extends AppError {
  constructor(message = 'Database operation failed', cause?: Error, details?: any) {
    super(message, 500, 'DatabaseError', details, cause);
  }
}
export class ConnectionError extends DatabaseError {
  constructor(message = 'Database connection failed', cause?: Error, details?: any) {
    super(message, cause, details);
    this.name = 'ConnectionError';
  }
}

export class QueryError extends DatabaseError {
  constructor(message = 'Database query failed', cause?: Error, details?: any) {
    super(message, cause, details);
    this.name = 'QueryError';
  }
}

export class TransactionError extends DatabaseError {
  constructor(message = 'Database transaction failed', cause?: Error, details?: any) {
    super(message, cause, details);
    this.name = 'TransactionError';
  }
}

export class MigrationError extends DatabaseError {
  constructor(message = 'Database migration failed', cause?: Error, details?: any) {
    super(message, cause, details);
    this.name = 'MigrationError';
  }
}

export class RecordNotFoundError extends DatabaseError {
  constructor(message = 'Record not found', cause?: Error, details?: any) {
    super(message, cause, details);
    this.name = 'RecordNotFoundError';
  }
}

export class DuplicateRecordError extends DatabaseError {
  constructor(message = 'Duplicate record found', cause?: Error, details?: any) {
    super(message, cause, details);
    this.name = 'DuplicateRecordError';
  }
}

export class UniqueConstraintError extends DatabaseError {
  constructor(message = 'Unique constraint violation', cause?: Error, details?: any) {
    super(message, cause, details);
    this.name = 'UniqueConstraintError';
  }
}
export class ForeignKeyConstraintError extends DatabaseError {
  constructor(message = 'Foreign key constraint violation', cause?: Error, details?: any) {
    super(message, cause, details);
    this.name = 'ForeignKeyConstraintError';
  }
}