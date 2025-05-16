import { Logger } from 'pino';

import { AbortError } from '@/errors/base.js';
import { createChildLogger } from '@/libs/logger.js';
import { redisClient } from '@/libs/redis.js';
// @ts-expect-error: Redlock types are not resolved correctly due to package exports
import Redlock from 'redlock';
import { config } from '@/config/index.ts';

/**
 * Trace context for distributed tracing
 */
export type TraceContext = Record<string, any>;

/**
 * Common options for service methods
 */
export interface ServiceOptions {
  /** AbortSignal for cancellation support */
  signal?: AbortSignal;
  /** Transaction context if running in a transaction */
  transactionContext?: any;
  /** Trace context for distributed tracing */
  traceContext?: TraceContext;
}

/**
 * Pagination result interface
 */
export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page?: number | null | undefined;
  limit?: number | null | undefined;
  totalPages?: number | null | undefined;
  hasMore?: boolean | null | undefined;
  nextCursor?: any | null | undefined;
}

/**
 * Base query parameters for paginated requests
 */
export interface BaseQuery {
  page?: number | null | undefined;
  limit?: number | null | undefined;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

/**
 * Interface for service initialization options
 */
export interface ServiceInitOptions {
  logger?: Logger;
  traceContext?: TraceContext;
}

/**
 * Generic service interface that defines common operations
 */
export interface IService {
  /**
   * Initialize the service with optional context
   */
  init(options?: ServiceInitOptions): Promise<void>;

  /**
   * Cleanup resources used by the service
   */
  cleanup(): Promise<void>;

  /**
   * Run operations in a transaction
   */
  withTransaction<T>(
    callback: (service: this) => Promise<T>,
    options?: ServiceOptions,
  ): Promise<T>;

  /**
   * Run a function with a distributed lock (if Redis is enabled), or fallback to in-memory lock (single process).
   * @param key The unique key for the lock
   * @param callback The function to run while holding the lock
   * @param ttlMs Lock time-to-live in milliseconds (default: 10_000)
   */
  withLock<T>(
    key: string,
    callback: () => Promise<T>,
    ttlMs?: number,
  ): Promise<T>;
}

/**
 * Abstract base service providing common functionality
 */
export abstract class AbstractService implements IService {
  protected logger: Logger;
  protected serviceName: string;
  protected initialized: boolean = false;

  // In-memory lock fallback for withLock
  private inMemoryLocks = new Map<string, Promise<void> | null>();

  constructor(serviceName: string, logger?: Logger) {
    this.serviceName = serviceName;
    this.logger = logger || createChildLogger({ service: serviceName });
  }

  /**
   * Initialize the service with optional context
   */
  public async init(options?: ServiceInitOptions): Promise<void> {
    if (options?.logger) {
      this.logger = options.logger;
    }

    if (options?.traceContext) {
      this.logger = this.logger.child(options.traceContext);
    }

    this.initialized = true;
    this.logger.debug(`${this.serviceName} service initialized`);
  }

  /**
   * Cleanup resources used by the service
   */
  public async cleanup(): Promise<void> {
    // Base implementation does nothing
    this.logger.debug(`${this.serviceName} service cleaned up`);
  }

  /**
   * Run operations in a transaction - must be implemented by subclasses
   */
  public abstract withTransaction<T>(
    callback: (service: this) => Promise<T>,
    options?: ServiceOptions,
  ): Promise<T>;

  /**
   * Run a function with a distributed lock (if Redis is enabled), or fallback to in-memory lock (single process).
   * @param key The unique key for the lock
   * @param callback The function to run while holding the lock
   * @param ttlMs Lock time-to-live in milliseconds (default: 10_000)
   */
  public async withLock<T>(
    key: string,
    callback: () => Promise<T>,
    ttlMs?: number,
  ): Promise<T> {
    const lockKey = `${config.cache.namespace}:lock:${key}`;
    if (redisClient) {
      // Use Redlock for distributed locking
      const redlock = new Redlock([redisClient], {
        retryCount: 10,
        retryDelay: 200,
        retryJitter: 100,
      });
      let lock;
      try {
        lock = await redlock.acquire([lockKey], ttlMs);
        this.logger.debug(
          { lockKey, ttlMs },
          `Acquired distributed lock: ${lockKey}`,
        );
        const result = await callback();
        await lock.release();
        this.logger.debug({ lockKey }, `Released distributed lock: ${lockKey}`);
        return result;
      } catch (err: any) {
        if (lock) {
          try {
            await lock.release();
          } catch (releaseErr) {
            this.logger.warn(
              { lockKey, releaseErr },
              `Failed to release lock: ${lockKey}`,
            );
          }
        }
        this.logger.error(
          { lockKey, err },
          `Error in withLock for key: ${lockKey}`,
        );
        throw err;
      }
    } else {
      // In-memory lock fallback (single process only)
      let currentLock = this.inMemoryLocks.get(lockKey);
      // Wait for any existing lock to finish
      while (currentLock) {
        await currentLock;
        currentLock = this.inMemoryLocks.get(lockKey);
      }
      // Set a new lock (promise that resolves when callback completes)
      let resolveLock: () => void = () => {};
      const lockPromise = new Promise<void>((resolve) => {
        resolveLock = resolve;
      });
      this.inMemoryLocks.set(lockKey, lockPromise);
      try {
        const result = await callback();
        return result;
      } finally {
        this.inMemoryLocks.delete(lockKey);
        resolveLock();
      }
    }
  }

  /**
   * Create a child logger with trace context
   */
  protected getContextLogger(options?: ServiceOptions): Logger {
    if (options?.traceContext) {
      return this.logger.child(options.traceContext);
    }
    return this.logger;
  }

  /**
   * Check if a request has been aborted
   */
  protected checkAborted(options?: ServiceOptions): void {
    if (options?.signal?.aborted) {
      throw new AbortError('Request aborted');
    }
  }

  /**
   * Track method execution time and log performance
   */
  protected async trackExecution<T>(
    methodName: string,
    executeFunc: () => Promise<T>,
    options?: ServiceOptions,
    context?: Record<string, any>,
  ): Promise<T> {
    this.checkAborted(options);

    const contextLogger = this.getContextLogger(options);
    const startTime = Date.now();

    try {
      const result = await executeFunc();
      const duration = Date.now() - startTime;

      if (duration > 1000) {
        // Log slow operations (over 1 second)
        contextLogger.warn(
          {
            method: methodName,
            duration,
            ...context,
          },
          `Slow operation detected: ${this.serviceName}.${methodName} (${duration}ms)`,
        );
      } else {
        contextLogger.debug(
          {
            method: methodName,
            duration,
            ...context,
          },
          `Executed ${this.serviceName}.${methodName}`,
        );
      }

      return result;
    } catch (error: any) {
      const duration = Date.now() - startTime;

      contextLogger.error(
        {
          method: methodName,
          duration,
          error,
          ...context,
        },
        `Error in ${this.serviceName}.${methodName}: ${error.message}`,
      );

      throw error;
    }
  }
}
