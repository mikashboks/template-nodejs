import { AbortError } from "@/errors/index.ts";
import { createChildLogger } from "@/libs/logger.ts";
import { IBaseModel, BaseRepository, QueryOptions } from "@/repo/base.ts";
import { Logger } from "pino";

export type TraceContext = Record<string, any>;
/**
 * Common options for service methods
 */
export interface ServiceOptions {
  /** AbortSignal for cancellation support */
  signal?: AbortSignal;
  /** Transaction context if running in a transaction */
  transactionContext?: any;

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
  init(options?: ServiceInitOptions): void;
  
  /**
   * Cleanup resources used by the service
   */
  cleanup(): Promise<void>;
  
  /**
   * Run operations in a transaction
   */
  withTransaction<T>(callback: (service: this) => Promise<T>, options?: ServiceOptions): Promise<T>;
}

/**
 * Basic repository-based service interface
 */
export interface IRepositoryService<
  T, // Entity type
  Q extends BaseQuery = BaseQuery, // Query type
  CreateInput = any, // Create input type
  UpdateInput = any, // Update input type
  Id = string // ID type
> extends IService {
  /**
   * Find entities with pagination and filtering
   */
  find(query: Q, options?: ServiceOptions): Promise<PaginatedResult<T>>;
  
  /**
   * Find an entity by ID
   */
  findById(id: Id, options?: ServiceOptions): Promise<T | null>;
  
  /**
   * Create a new entity
   */
  create(data: CreateInput, options?: ServiceOptions): Promise<T>;
  
  /**
   * Update an existing entity
   */
  update(id: Id, data: UpdateInput, options?: ServiceOptions): Promise<T | null>;
  
  /**
   * Delete an entity (soft delete by default)
   */
  delete(id: Id, options?: ServiceOptions): Promise<boolean>;
  
  /**
   * Hard delete an entity (permanent removal)
   */
  hardDelete?(id: Id, options?: ServiceOptions): Promise<boolean>;
  
  /**
   * Restore a soft-deleted entity
   */
  restore?(id: Id, options?: ServiceOptions): Promise<T | null>;
}

// src/services/base/abstract.service.ts
/**
 * Abstract base service providing common functionality
 */
export abstract class AbstractService implements IService {
  protected logger: Logger;
  protected serviceName: string;
  protected initialized: boolean = false;

  constructor(serviceName: string, logger?: Logger) {
    this.serviceName = serviceName;
    this.logger = logger || createChildLogger({ service: serviceName });
  }

  /**
   * Initialize the service with optional context
   */
  public init(options?: ServiceInitOptions): void {
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
    options?: ServiceOptions
  ): Promise<T>;
  
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
    context?: Record<string, any>
  ): Promise<T> {
    this.checkAborted(options);
    
    const contextLogger = this.getContextLogger(options);
    const startTime = Date.now();
    
    try {
      const result = await executeFunc();
      const duration = Date.now() - startTime;
      
      if (duration > 1000) { // Log slow operations (over 1 second)
        contextLogger.warn({
          method: methodName,
          duration,
          ...context
        }, `Slow operation detected: ${this.serviceName}.${methodName} (${duration}ms)`);
      } else {
        contextLogger.debug({
          method: methodName,
          duration,
          ...context
        }, `Executed ${this.serviceName}.${methodName}`);
      }
      
      return result;
    } catch (error: any) {
      const duration = Date.now() - startTime;
      
      contextLogger.error({
        method: methodName,
        duration,
        error,
        ...context
      }, `Error in ${this.serviceName}.${methodName}: ${error.message}`);
      
      throw error;
    }
  }
}

/**
 * Base implementation of a repository-backed service
 */
export abstract class RepositoryService<
  TModel extends IBaseModel,
  TRepo extends BaseRepository<TModel, any, any, any, any, any, any, any, any>,
  TQuery extends BaseQuery = BaseQuery,
  TCreateInput = any,
  TUpdateInput = any,
  TId = string
> extends AbstractService implements IRepositoryService<TModel, TQuery, TCreateInput, TUpdateInput, TId> {
  protected repository: TRepo;
  
  constructor(
    serviceName: string,
    repository: TRepo,
    logger?: Logger
  ) {
    super(serviceName, logger);
    this.repository = repository;
  }
  
  /**
   * Cleanup resources including repository
   */
  public override async cleanup(): Promise<void> {
    await super.cleanup();
    // Repository doesn't have a cleanup method by default
    // If your repository has one, call it here
  }
  
  /**
   * Transform service query to repository query
   * Override in subclasses for custom query mapping
   */
  protected transformQuery(query: TQuery): any {
    // Default implementation assumes repository query structure matches service query
    return query;
  }
  
  /**
   * Transform create input to repository create input
   * Override in subclasses for custom input mapping
   */
  protected transformCreateInput(data: TCreateInput): any {
    // Default implementation assumes repository input structure matches service input
    return data;
  }
  
  /**
   * Transform update input to repository update input
   * Override in subclasses for custom input mapping
   */
  protected transformUpdateInput(data: TUpdateInput): any {
    // Default implementation assumes repository input structure matches service input
    return data;
  }
  
  
  /**
   * Find entities with pagination and filtering
   */
  public async find(
    query: TQuery,
    options?: ServiceOptions
  ): Promise<PaginatedResult<TModel>> {
    return this.trackExecution('find', async () => {
      const repoQuery = this.transformQuery(query);
      
      // Transform query to repository format
      const paginationOptions: QueryOptions<any, any, any> = {
        pagination: {
          strategy: 'offset',
          page: query.page || 1,
          pageSize: query.limit || 10
        }
      };
      
      // Add sorting if provided
      if (query.sortBy) {
        paginationOptions.orderBy = {
          [query.sortBy]: query.sortOrder || 'asc'
        };
      }
      
      const result = await this.repository.findAll(repoQuery, paginationOptions);
      
      // Transform repository result to service result format
      return {
        data: result.data,
        total: result.total,
        page: query.page || 1,
        limit: query.limit || 10,
        totalPages: result.pageInfo?.totalPages,
        hasMore: result.hasMore,
        nextCursor: result.nextCursor
      };
    }, options, { query });
  }
  
  /**
   * Find an entity by ID
   */
  public async findById(id: TId, options?: ServiceOptions): Promise<TModel | null> {
    return this.trackExecution('findById', async () => {
      return this.repository.findById(id as any);
    }, options, { id });
  }
  
  /**
   * Create a new entity
   */
  public async create(data: TCreateInput, options?: ServiceOptions): Promise<TModel> {
    return this.trackExecution('create', async () => {
      const repoData = this.transformCreateInput(data);
      return this.repository.create(repoData);
    }, options, { data });
  }
  
  /**
   * Update an existing entity
   */
  public async update(id: TId, data: TUpdateInput, options?: ServiceOptions): Promise<TModel | null> {
    return this.trackExecution('update', async () => {
      const repoData = this.transformUpdateInput(data);
      return this.repository.update({ id } as any, repoData);
    }, options, { id, data });
  }
  
  /**
   * Delete an entity (soft delete by default)
   */
  public async delete(id: TId, options?: ServiceOptions): Promise<boolean> {
    return this.trackExecution('delete', async () => {
      try {
        await this.repository.softDelete({ id } as any);
        return true;
      } catch (error: any) {
        // Ignore not found errors
        if (error.name === 'RecordNotFoundError') {
          return false;
        }
        throw error;
      }
    }, options, { id });
  }
  
  /**
   * Hard delete an entity (permanent removal)
   */
  public async hardDelete(id: TId, options?: ServiceOptions): Promise<boolean> {
    return this.trackExecution('hardDelete', async () => {
      try {
        await this.repository.hardDelete({ id } as any);
        return true;
      } catch (error: any) {
        // Ignore not found errors
        if (error.name === 'RecordNotFoundError') {
          return false;
        }
        throw error;
      }
    }, options, { id });
  }
  
  /**
   * Restore a soft-deleted entity
   */
  public async restore(id: TId, options?: ServiceOptions): Promise<TModel | null> {
    return this.trackExecution('restore', async () => {
      try {
        return await this.repository.restore({ id } as any);
      } catch (error: any) {
        // Ignore not found errors
        if (error.name === 'RecordNotFoundError') {
          return null;
        }
        throw error;
      }
    }, options, { id });
  }
}

/**
 * Base class for services that interact with external APIs
 */
export abstract class ExternalService extends AbstractService {
  protected baseUrl: string;
  protected defaultTimeout: number;
  
  constructor(
    serviceName: string,
    baseUrl: string,
    defaultTimeout: number = 10000,
    logger?: Logger
  ) {
    super(serviceName, logger);
    this.baseUrl = baseUrl;
    this.defaultTimeout = defaultTimeout;
  }
  
  /**
   * Run operations in a transaction (not supported for external services)
   */
  public async withTransaction<T>(
    callback: (service: this) => Promise<T>,
    options?: ServiceOptions
  ): Promise<T> {
    this.logger.warn('Transaction support not available for external services');
    return callback(this);
  }
  
  /**
   * Make a request to the external API with proper timeout and error handling
   */
  protected async request<T>(
    method: string,
    path: string,
    options?: {
      data?: any;
      params?: Record<string, string>;
      headers?: Record<string, string>;
      timeout?: number;
      signal?: AbortSignal | null;
      traceContext?: TraceContext;
    }
  ): Promise<T> {
    const contextLogger = options?.traceContext 
      ? this.logger.child(options.traceContext)
      : this.logger;
    
    // Build URL with query parameters
    const url = new URL(path, this.baseUrl);
    if (options?.params) {
      Object.entries(options.params).forEach(([key, value]) => {
        url.searchParams.append(key, value);
      });
    }
    
    // Prepare request options
    const fetchOptions: RequestInit = {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
      signal: options?.signal ?? null,
    };
    
    // Add request body for non-GET requests
    if (method !== 'GET' && options?.data) {
      fetchOptions.body = JSON.stringify(options.data);
    }
    
    // Create timeout controller if not provided
    let timeoutId: NodeJS.Timeout | undefined;
    const timeout = options?.timeout ?? this.defaultTimeout;
    
    const controller = new AbortController();
    if (!options?.signal) {
      timeoutId = setTimeout(() => controller.abort(), timeout);
      fetchOptions.signal = controller.signal;
    }
    
    try {
      const startTime = Date.now();
      
      const response = await fetch(url.toString(), fetchOptions);
      const duration = Date.now() - startTime;
      
      // Log the request
      contextLogger.debug({
        method,
        url: url.toString(),
        status: response.status,
        duration,
      }, `External request: ${method} ${url.pathname}`);
      
      // Handle non-2xx responses
      if (!response.ok) {
        const errorText = await response.text();
        contextLogger.error({
          method,
          url: url.toString(),
          status: response.status,
          duration,
          error: errorText,
        }, `External request failed: ${method} ${url.pathname}`);
        
        throw new Error(`API request failed with status ${response.status}: ${errorText}`);
      }
      
      // Parse JSON response
      const data = await response.json();
      return data as T;
    } catch (error: any) {
      contextLogger.error({
        method,
        url: url.toString(),
        error: error.message,
      }, `External request error: ${method} ${url.pathname}`);
      
      // Rethrow with more context
      throw new Error(`API request failed: ${error.message}`);
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }
  }
}
