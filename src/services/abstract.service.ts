import { PrismaClient, Prisma } from '@prisma/client';
import { IService, ServiceOptions, PaginatedResult, BaseQuery } from './service.interface';
import { logger, createChildLogger } from '@/libs/logger.ts';

/**
 * Abstract base service implementing common functionality for Prisma-based services
 */
export abstract class AbstractService<
  T, // Entity type
  Q extends BaseQuery = BaseQuery, // Query type
  CreateInput = any, // Create input type
  UpdateInput = any, // Update input type
  Id = string // ID type
> implements IService<T, Q, CreateInput, UpdateInput, Id> {
  protected prisma: PrismaClient;
  protected logger: any; // Use your logger type
  protected entityName: string;

  constructor(entityName: string) {
    this.entityName = entityName;
    this.logger = createChildLogger({ module: `${entityName}Service` });
    
    // Create a new PrismaClient instance
    this.prisma = new PrismaClient({
      // Set log levels based on environment
      log: config().server.isDevelopment 
        ? ['query', 'info', 'warn', 'error'] 
        : ['error'],
      // Configure connection timeout for Cloud Run
      datasources: {
        db: {
          url: config().database.url
        }
      },
      // Enable Prisma metrics for monitoring
      __internal: {
        measurePerformance: true
      }
    });
  }

  /**
   * Disconnect from database - important for Cloud Run to prevent connection leaks
   */
  public async disconnect(): Promise<void> {
    try {
      await this.prisma.$disconnect();
    } catch (err) {
      this.logger.error({ err }, `Error disconnecting from database`);
    }
  }

  /**
   * Find entities with pagination and filtering
   * Requires implementation in child classes to handle specific entity requirements
   */
  public abstract find(query: Q, options?: ServiceOptions): Promise<PaginatedResult<T>>;

  /**
   * Find an entity by ID
   * Requires implementation in child classes
   */
  public abstract findById(id: Id, options?: ServiceOptions): Promise<T | null>;

  /**
   * Create a new entity
   * Requires implementation in child classes
   */
  public abstract create(data: CreateInput, options?: ServiceOptions): Promise<T>;

  /**
   * Update an existing entity
   * Requires implementation in child classes
   */
  public abstract update(id: Id, data: UpdateInput, options?: ServiceOptions): Promise<T | null>;

  /**
   * Delete an entity
   * Requires implementation in child classes
   */
  public abstract delete(id: Id, options?: ServiceOptions): Promise<boolean>;

  /**
   * Helper method to create a child logger with trace context
   */
  protected getLogger(options?: ServiceOptions): any {
    if (options?.traceContext) {
      return this.logger.child(options.traceContext);
    }
    return this.logger;
  }

  /**
   * Helper method to check if the request was aborted
   */
  protected checkAborted(options?: ServiceOptions): void {
    if (options?.signal?.aborted) {
      throw new Error('Request aborted');
    }
  }

  /**
   * Helper method to handle common database errors with appropriate HTTP status codes
   */
  protected handleDatabaseError(err: any, operation: string, entityId?: Id, data?: any): never {
    const logContext = {
      err,
      entityName: this.entityName,
      operation,
      ...(entityId !== undefined && { entityId }),
      ...(data !== undefined && { data })
    };

    this.logger.error(logContext, `Error during ${operation} operation`);

    // Handle specific Prisma errors
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      // Connection issues - important for Cloud Run
      if (err.code === 'P1001' || err.code === 'P1002') {
        throw new CloudRunError('Database connection error', 503);
      }
      
      // Query timeout
      if (err.code === 'P1008') {
        throw new CloudRunError('Database query timeout', 504);
      }

      // Not found
      if (err.code === 'P2025' || err.code === 'P2001') {
        if (operation === 'update' || operation === 'findById') {
          // Return null in derived classes for not found in appropriate operations
          throw new CloudRunError(`${this.entityName} not found`, 404);
        }
      }
      
      // Unique constraint violations
      if (err.code === 'P2002') {
        throw new CloudRunError(`A ${this.entityName} with this identifier already exists`, 409);
      }
      
      // Foreign key constraint violations
      if (err.code === 'P2003') {
        if (operation === 'delete') {
          throw new CloudRunError(`Cannot delete ${this.entityName}: it is referenced by other records`, 409);
        }
        throw new CloudRunError(`Invalid reference in ${this.entityName} data`, 400);
      }
    }
    
    // Handle abort error
    if (err.name === 'AbortError') {
      throw new CloudRunError('Request aborted', 499);
    }
    
    // Generic error fallback
    throw new CloudRunError(`Error during ${this.entityName} ${operation}`, 500);
  }
}