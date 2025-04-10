import { Logger } from 'pino';

import { IBaseModel, BaseRepository, QueryOptions } from '@/repo/base.js';

import {
  AbstractService,
  BaseQuery,
  IService,
  PaginatedResult,
  ServiceOptions,
} from './abstract.service.js';

/**
 * Basic repository-based service interface
 */
export interface IRepositoryService<
  T, // Entity type
  Q extends BaseQuery = BaseQuery, // Query type
  CreateInput = any, // Create input type
  UpdateInput = any, // Update input type
  Id = string, // ID type
> extends IService {
  find(query: Q, options?: ServiceOptions): Promise<PaginatedResult<T>>;
  findById(id: Id, options?: ServiceOptions): Promise<T | null>;
  create(data: CreateInput, options?: ServiceOptions): Promise<T>;
  update(
    id: Id,
    data: UpdateInput,
    options?: ServiceOptions,
  ): Promise<T | null>;
  delete(id: Id, options?: ServiceOptions): Promise<boolean>;
  hardDelete?(id: Id, options?: ServiceOptions): Promise<boolean>;
  restore?(id: Id, options?: ServiceOptions): Promise<T | null>;
}

/**
 * Base implementation of a repository-backed service
 */
export abstract class RepositoryService<
    TModel extends IBaseModel,
    TRepo extends BaseRepository<
      TModel,
      any,
      any,
      any,
      any,
      any,
      any,
      any,
      any
    >,
    TQuery extends BaseQuery = BaseQuery,
    TCreateInput = any,
    TUpdateInput = any,
  >
  extends AbstractService
  implements
    IRepositoryService<TModel, TQuery, TCreateInput, TUpdateInput, string>
{
  protected repository: TRepo;

  /**
   * Creates a new repository service
   *
   * @param serviceName - Name of the service for logging and metrics
   * @param repository - Repository instance to use for data operations
   * @param logger - Optional logger instance
   */
  constructor(serviceName: string, repository: TRepo, logger?: Logger) {
    super(serviceName, logger);
    this.repository = repository;
  }

  /**
   * Execute a callback within a transaction context
   *
   * @param callback - Function to execute within the transaction
   * @param options - Service options
   * @returns Result of the callback
   */
  public async withTransaction<T>(
    callback: (service: this) => Promise<T>,
    options?: ServiceOptions,
  ): Promise<T> {
    const contextLogger = this.getContextLogger(options);

    // Check if repository supports transactions
    if (typeof this.repository.withTransaction !== 'function') {
      contextLogger.warn(
        'Repository does not support transactions. Executing without transaction context.',
      );
      return callback(this);
    }

    // Execute with transaction if supported
    return this.repository.withTransaction(async (transactionRepo) => {
      // Create a transactional service instance
      const transactionalService = Object.create(this);
      // Get repository instance bound to the transaction
      transactionalService.repository = transactionRepo;
      return callback(transactionalService);
    });
  }

  /**
   * @inheritdoc
   */
  public override async cleanup(): Promise<void> {
    await super.cleanup();
    // Add any repository-specific cleanup if needed
  }

  /**
   * Transform query parameters to repository format
   * Override in subclasses for custom query transformation
   *
   * @param query - Query parameters
   * @returns Transformed query for repository
   */
  protected transformQuery(query: TQuery): any {
    return query;
  }

  /**
   * Transform create input to repository format
   * Override in subclasses for custom data transformation
   *
   * @param data - Create input data
   * @returns Transformed data for repository
   */
  protected transformCreateInput(data: TCreateInput): any {
    return data;
  }

  /**
   * Transform update input to repository format
   * Override in subclasses for custom data transformation
   *
   * @param data - Update input data
   * @returns Transformed data for repository
   */
  protected transformUpdateInput(data: TUpdateInput): any {
    return data;
  }

  /**
   * Find entities matching query criteria
   *
   * @param query - Query parameters
   * @param options - Service options
   * @returns Paginated result of matching entities
   */
  public async find(
    query: TQuery,
    options?: ServiceOptions,
  ): Promise<PaginatedResult<TModel>> {
    return this.trackExecution(
      'find',
      async () => {
        const repoQuery = this.transformQuery(query);

        const paginationOptions: QueryOptions<any, any, any> = {
          pagination: {
            strategy: 'offset',
            page: query.page || 1,
            pageSize: query.limit || 10,
          },
        };

        if (query.sortBy) {
          paginationOptions.orderBy = {
            [query.sortBy]: query.sortOrder || 'asc',
          };
        }

        const result = await this.repository.findAll(
          repoQuery,
          paginationOptions,
        );

        return {
          data: result.data,
          total: result.total,
          page: query.page || 1,
          limit: query.limit || 10,
          totalPages: result.pageInfo?.totalPages,
          hasMore: result.hasMore,
          nextCursor: result.nextCursor,
        };
      },
      options,
      { query },
    );
  }

  /**
   * Find entity by ID
   *
   * @param id - Entity ID
   * @param options - Service options
   * @returns Entity or null if not found
   */
  public async findById(
    id: string,
    options?: ServiceOptions,
  ): Promise<TModel | null> {
    return this.trackExecution(
      'findById',
      async () => {
        return this.repository.findById(id);
      },
      options,
      { id },
    );
  }

  /**
   * Create new entity
   *
   * @param data - Entity data
   * @param options - Service options
   * @returns Created entity
   */
  public async create(
    data: TCreateInput,
    options?: ServiceOptions,
  ): Promise<TModel> {
    return this.trackExecution(
      'create',
      async () => {
        const repoData = this.transformCreateInput(data);
        return this.repository.create(repoData);
      },
      options,
      { data },
    );
  }

  /**
   * Update existing entity
   *
   * @param id - Entity ID
   * @param data - Updated entity data
   * @param options - Service options
   * @returns Updated entity or null if not found
   */
  public async update(
    id: string,
    data: TUpdateInput,
    options?: ServiceOptions,
  ): Promise<TModel | null> {
    return this.trackExecution(
      'update',
      async () => {
        const repoData = this.transformUpdateInput(data);

        // Create properly typed criteria based on ID
        const criteria = { id } as Record<string, string>;

        try {
          return await this.repository.update(criteria, repoData);
        } catch (error: any) {
          if (error.name === 'RecordNotFoundError') return null;
          throw error;
        }
      },
      options,
      { id, dataFields: Object.keys(data as any) },
    );
  }

  /**
   * Soft delete an entity (mark as deleted)
   *
   * @param id - Entity ID
   * @param options - Service options
   * @returns True if deleted, false if not found
   */
  public async delete(id: string, options?: ServiceOptions): Promise<boolean> {
    return this.trackExecution(
      'delete',
      async () => {
        try {
          // Create properly typed criteria based on ID
          const criteria = { id } as Record<string, string>;
          await this.repository.softDelete(criteria);
          return true;
        } catch (error: any) {
          if (error.name === 'RecordNotFoundError') return false;
          throw error;
        }
      },
      options,
      { id },
    );
  }

  /**
   * Permanently delete an entity
   *
   * @param id - Entity ID
   * @param options - Service options
   * @returns True if deleted, false if not found
   * @throws Error if not supported by repository
   */
  public async hardDelete(
    id: string,
    options?: ServiceOptions,
  ): Promise<boolean> {
    // Check if repository supports hardDelete
    if (typeof this.repository.hardDelete !== 'function') {
      throw new Error(
        `Hard delete not supported by repository for service ${this.serviceName}`,
      );
    }

    return this.trackExecution(
      'hardDelete',
      async () => {
        try {
          // Create properly typed criteria based on ID
          const criteria = { id } as Record<string, string>;
          await this.repository.hardDelete!(criteria);
          return true;
        } catch (error: any) {
          if (error.name === 'RecordNotFoundError') return false;
          throw error;
        }
      },
      options,
      { id },
    );
  }

  /**
   * Restore a soft-deleted entity
   *
   * @param id - Entity ID
   * @param options - Service options
   * @returns Restored entity or null if not found
   * @throws Error if not supported by repository
   */
  public async restore(
    id: string,
    options?: ServiceOptions,
  ): Promise<TModel | null> {
    // Check if repository supports restore
    if (typeof this.repository.restore !== 'function') {
      throw new Error(
        `Restore not supported by repository for service ${this.serviceName}`,
      );
    }

    return this.trackExecution(
      'restore',
      async () => {
        try {
          // Create properly typed criteria based on ID
          const criteria = { id } as Record<string, string>;
          return await this.repository.restore!(criteria);
        } catch (error: any) {
          if (error.name === 'RecordNotFoundError') return null;
          throw error;
        }
      },
      options,
      { id },
    );
  }
}
