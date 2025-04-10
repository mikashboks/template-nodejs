import { ValidationError } from '@/errors/validation-errors.js';
import { ValidationResult } from '@/libs/validation.js';

import {
  DatabaseError,
  RecordNotFoundError,
  UniqueConstraintError,
} from '../errors/database-errors.js';
import { createChildLogger } from '../libs/logger.js';
import prisma from '../libs/prisma.js';

import type {
  PrismaClient,
  // Example: If you have a PrismaClient, import it here
  // PrismaClient
} from '@prisma/client';
import type { Logger } from 'pino';

/**
 * Configuration for soft delete behavior
 */
export interface SoftDeleteConfig {
  /** Whether the model has a boolean "deleted" field */
  useDeletedFlag: boolean;
  /** Whether the model has a nullable "deletedAt" date field */
  useDeletedAt: boolean;
}

/**
 * Configuration for tracking and auditing
 */
export interface TrackingConfig {
  /** Whether to track performance metrics */
  trackPerformance: boolean;
  /** Whether to track method execution for auditing */
  trackAuditing: boolean;
  /** Maximum time in ms before a slow operation warning is logged */
  slowOperationThreshold: number;
}

/**
 * Operation hook types
 */
export type OperationName =
  | 'create'
  | 'createMany'
  | 'update'
  | 'updateMany'
  | 'softDelete'
  | 'softDeleteMany'
  | 'hardDelete'
  | 'hardDeleteMany'
  | 'findOne'
  | 'findAll'
  | 'findByUnique'
  | 'count'
  | 'exists'
  | 'upsert'
  | 'upsertCreate'
  | 'upsertUpdate'
  | 'restore'
  | 'restoreMany';

export type PreHook<T = any> = (data: T) => Promise<T> | T;
export type PostHook<T = any> = (result: T) => Promise<T> | T;

/**
 * Pagination types
 */
export type PaginationStrategy = 'offset' | 'cursor';

export interface BasePaginationOptions {
  strategy?: PaginationStrategy;
}

export interface OffsetPaginationOptions extends BasePaginationOptions {
  strategy: 'offset';
  page?: number;
  pageSize?: number;
}

export interface CursorPaginationOptions<TCursor>
  extends BasePaginationOptions {
  strategy: 'cursor';
  cursor?: TCursor;
  take?: number;
}

export type PaginationOptions<TCursor = any> =
  | OffsetPaginationOptions
  | CursorPaginationOptions<TCursor>;

export interface QueryOptions<TOrderBy, TSelect, TInclude> {
  pagination?: PaginationOptions | null | undefined;
  orderBy?: TOrderBy | TOrderBy[];
  select?: TSelect;
  include?: TInclude;
}

export interface IBaseModel {
  id: number;
  createdAt: Date;
  updatedAt: Date;
  deleted?: boolean;
  deletedAt?: Date | null;
}

/**
 * Execute database operation with proper error handling and logging
 */
async function executeDbOperation<T>(
  operation: () => Promise<T>,
  operationName: string,
  logger: Logger,
  context?: Record<string, any>,
): Promise<T> {
  try {
    logger.debug(`Executing operation: ${operationName}`);
    const startTime = Date.now();
    const result = await operation();
    const duration = Date.now() - startTime;
    logger.debug(`Operation ${operationName} completed in ${duration}ms`);
    return result;
  } catch (error: any) {
    // Log the error
    logger.error(`Operation ${operationName} failed`, {
      error: error?.message,
      stack: error?.stack,
      code: error?.code,
      ...(context && { context }),
    });

    // Map Prisma errors to our custom error types
    if (error?.code === 'P2025') {
      // Record not found
      throw new RecordNotFoundError(operationName.split('.')[0], error);
    } else if (error?.code === 'P2002') {
      // Unique constraint violation
      const field = error.meta?.target?.[0] || 'unknown';
      throw new UniqueConstraintError(operationName.split('.')[0], error, {
        field,
      });
    }

    // Generic database error
    throw new DatabaseError(
      `Failed to execute ${operationName}${error?.code ? ` (Code: ${error.code})` : ''}`,
      error,
      context,
    );
  }
}

/**
 * Repository Query Builder for fluent query construction
 */
export class RepositoryQueryBuilder<
  TRepo extends BaseRepository<any, any, any, any, any, any, any, any, any>,
  TModel extends IBaseModel,
  TWhere,
  TOrderBy,
  TSelect,
  TInclude,
> {
  private whereConditions: TWhere;
  private selectFields?: TSelect;
  private includeRelations?: TInclude;
  private orderByFields?: TOrderBy | TOrderBy[];
  private limitValue?: number;
  private skipValue?: number;
  private cursorValue?: any;

  constructor(private readonly repository: TRepo) {
    this.whereConditions = {} as TWhere;
  }

  /**
   * Add where conditions (combined with AND)
   */
  where(conditions: TWhere): this {
    this.whereConditions = {
      ...this.whereConditions,
      ...conditions,
    } as TWhere;
    return this;
  }

  /**
   * Add fields to select
   */
  select(fields: TSelect): this {
    this.selectFields = fields;
    return this;
  }

  /**
   * Add relations to include
   */
  include(relations: TInclude): this {
    this.includeRelations = relations;
    return this;
  }

  /**
   * Add ordering
   */
  orderBy(fields: TOrderBy | TOrderBy[]): this {
    this.orderByFields = fields;
    return this;
  }

  /**
   * Set result limit
   */
  take(limit: number): this {
    this.limitValue = limit;
    return this;
  }

  /**
   * Set number of results to skip
   */
  skip(count: number): this {
    this.skipValue = count;
    return this;
  }

  /**
   * Set cursor for pagination
   */
  cursor(cursor: any): this {
    this.cursorValue = cursor;
    return this;
  }

  /**
   * Include only non-deleted records (applied by default)
   */
  onlyActive(): this {
    const notDeletedFilter = (this.repository as any).getNotDeletedFilter();
    this.whereConditions = {
      ...this.whereConditions,
      ...notDeletedFilter,
    } as TWhere;
    return this;
  }

  /**
   * Include only deleted records
   */
  onlyDeleted(): this {
    const deletedFilter = (this.repository as any).getDeletedFilter();
    this.whereConditions = {
      ...this.whereConditions,
      ...deletedFilter,
    } as TWhere;
    return this;
  }

  /**
   * Include all records (both active and deleted)
   */
  includeDeleted(): this {
    // Strip any deleted filters that might have been applied
    const whereWithoutDeletedFilters = { ...this.whereConditions };
    if ((whereWithoutDeletedFilters as any).deleted !== undefined) {
      delete (whereWithoutDeletedFilters as any).deleted;
    }
    if ((whereWithoutDeletedFilters as any).deletedAt !== undefined) {
      delete (whereWithoutDeletedFilters as any).deletedAt;
    }
    this.whereConditions = whereWithoutDeletedFilters as TWhere;
    return this;
  }

  /**
   * Execute the query and return first matching record
   */
  async findFirst(): Promise<TModel | null> {
    return this.repository.findOne(this.whereConditions, {
      orderBy: this.orderByFields,
      select: this.selectFields,
      include: this.includeRelations,
    });
  }

  /**
   * Execute the query and return all matching records
   */
  async findAll(): Promise<{
    data: TModel[];
    total: number;
    hasMore?: boolean;
    pageInfo?: any;
  }> {
    return this.repository.findAll(this.whereConditions, {
      pagination: this.limitValue
        ? {
            strategy: 'offset',
            page: this.skipValue
              ? Math.floor(this.skipValue / this.limitValue) + 1
              : 1,
            pageSize: this.limitValue,
          }
        : undefined,
      orderBy: this.orderByFields,
      select: this.selectFields,
      include: this.includeRelations,
    });
  }

  /**
   * Execute the query and return the count of matching records
   */
  async count(): Promise<number> {
    return this.repository.count(this.whereConditions);
  }

  /**
   * Check if any matching records exist
   */
  async exists(): Promise<boolean> {
    return this.repository.exists(this.whereConditions);
  }
}

/**
 * Factory for creating repository instances
 */
export class RepositoryFactory {
  constructor(private readonly prisma: any) {}

  /**
   * Create a new repository instance for a Prisma model
   *
   * @param modelName Name of the model (should match the Prisma model name)
   * @param softDeleteConfig Optional configuration for soft delete behavior
   * @param trackingConfig Optional configuration for tracking and auditing
   */
  create<
    TModel extends IBaseModel,
    TWhereUnique,
    TWhere,
    TOrderBy,
    TCreate,
    TUpdate,
    TSelect,
    TInclude,
  >(
    modelName: string,
    softDeleteConfig?: Partial<SoftDeleteConfig>,
    trackingConfig?: Partial<TrackingConfig>,
  ): BaseRepository<
    TModel,
    any, // TDelegate type - we can't easily infer this
    TWhereUnique,
    TWhere,
    TOrderBy,
    TCreate,
    TUpdate,
    TSelect,
    TInclude
  > {
    // Get the model delegate from the Prisma client
    const delegate = (this.prisma as any)[modelName.toLowerCase()];

    if (!delegate) {
      throw new Error(`Model ${modelName} not found in Prisma client`);
    }

    return new BaseRepository<
      TModel,
      any,
      TWhereUnique,
      TWhere,
      TOrderBy,
      TCreate,
      TUpdate,
      TSelect,
      TInclude
    >(delegate, modelName, softDeleteConfig, this.prisma, trackingConfig);
  }
}

/**
 * Generic repository base for common CRUD operations.
 *
 * TModel:         The shape of the Model (e.g. User).
 * TDelegate:      The specific Prisma delegate type (e.g. Prisma.UserDelegate<...>).
 * TWhereUnique:   The "WhereUniqueInput" type for this model.
 * TWhere:         The "WhereInput" type for this model.
 * TOrderBy:       The "OrderByInput" type (or array) for this model.
 * TCreate:        The "CreateInput" type for this model.
 * TUpdate:        The "UpdateInput" type for this model.
 * TSelect:        The "Select" type for this model.
 * TInclude:       The "Include" type for this model.
 */
export class BaseRepository<
  TModel extends IBaseModel,
  TDelegate extends {
    // Minimal methods used below; customize as needed
    findUnique: (args: any) => Promise<TModel | null>;
    findFirst: (args: any) => Promise<TModel | null>;
    findMany: (args: any) => Promise<TModel[]>;
    create: (args: any) => Promise<TModel>;
    createMany: (args: any) => Promise<{ count: number }>;
    update: (args: any) => Promise<TModel>;
    updateMany: (args: any) => Promise<{ count: number }>;
    delete: (args: any) => Promise<TModel>;
    deleteMany: (args: any) => Promise<{ count: number }>;
    upsert: (args: any) => Promise<TModel>;
    count: (args: any) => Promise<number>;
  },
  TWhereUnique,
  TWhere,
  TOrderBy,
  TCreate,
  TUpdate,
  TSelect,
  TInclude,
> {
  protected readonly logger: Logger;
  protected readonly auditLogger: Logger;

  private preHooks: Record<string, PreHook[]> = {};
  private postHooks: Record<string, PostHook[]> = {};

  private softDeleteConfig: SoftDeleteConfig;
  private trackingConfig: TrackingConfig;

  constructor(
    protected readonly model: TDelegate,
    protected readonly modelName: string,
    protected readonly prisma: PrismaClient,
    softDeleteConfig?: Partial<SoftDeleteConfig>,
    trackingConfig?: Partial<TrackingConfig>,
    auditLogger?: Logger,
  ) {
    this.logger = createChildLogger({ module: `Repository:${modelName}` });

    this.softDeleteConfig = {
      useDeletedFlag: true,
      useDeletedAt: true,
      ...softDeleteConfig,
    };
    this.trackingConfig = {
      trackPerformance: true,
      trackAuditing: false,
      slowOperationThreshold: 1000, // 1 second
      ...trackingConfig,
    };

    // Use main logger as audit logger if not provided
    this.auditLogger = auditLogger || this.logger;
  }

  /**
   * Helper method to get the filter criteria for "deleted" records
   */
  protected getDeletedFilter(): Partial<TWhere> {
    const filter = {} as Partial<TWhere>;

    if (this.softDeleteConfig.useDeletedAt) {
      (filter as any).deletedAt = { not: null };
    }

    if (this.softDeleteConfig.useDeletedFlag) {
      (filter as any).deleted = true;
    }

    return filter;
  }

  /**
   * Helper method to get the filter criteria for "not deleted" records
   */
  protected getNotDeletedFilter(): Partial<TWhere> {
    const filter = {} as Partial<TWhere>;

    if (this.softDeleteConfig.useDeletedAt) {
      (filter as any).deletedAt = null;
    }

    if (this.softDeleteConfig.useDeletedFlag) {
      (filter as any).deleted = false;
    }

    return filter;
  }

  /**
   * Data payload for soft-deleting
   */
  protected getSoftDeleteData(): Partial<TUpdate> {
    const data: any = {};
    // You can unify updatedAt usage as well
    data.updatedAt = new Date();
    if (this.softDeleteConfig.useDeletedAt) {
      data.deletedAt = new Date();
    }
    if (this.softDeleteConfig.useDeletedFlag) {
      data.deleted = true;
    }
    return data;
  }

  /**
   * Data payload for restoring a soft-deleted record
   */
  protected getRestoreData(): Partial<TUpdate> {
    const data: any = {};
    data.updatedAt = new Date();
    if (this.softDeleteConfig.useDeletedAt) {
      data.deletedAt = null;
    }
    if (this.softDeleteConfig.useDeletedFlag) {
      data.deleted = false;
    }
    return data;
  }

  /**
   * Create a new query builder for this repository
   */
  query(): RepositoryQueryBuilder<
    this,
    TModel,
    TWhere,
    TOrderBy,
    TSelect,
    TInclude
  > {
    return new RepositoryQueryBuilder<
      this,
      TModel,
      TWhere,
      TOrderBy,
      TSelect,
      TInclude
    >(this).onlyActive();
  }

  /**
   * Executes multiple repository operations in a single transaction
   *
   * @param callback Function that receives transactional repository and executes operations
   */
  async withTransaction<T>(callback: (repo: this) => Promise<T>): Promise<T> {
    if (!this.prisma) {
      throw new Error('Prisma client not provided to repository');
    }

    return this.prisma.$transaction(async (tx: any) => {
      // Create a transactional version of this repository
      const transactionalRepo = this.createTransactionalRepo(tx);
      return callback(transactionalRepo);
    });
  }

  /**
   * Creates a new instance of this repository that uses the transaction
   *
   * @param tx Prisma transaction object
   */
  protected createTransactionalRepo(tx: any): this {
    // Create a new repository instance with the transaction context
    // This assumes your models are accessible via prisma client as tx.user, tx.post, etc.
    const txModel = tx[this.modelName.toLowerCase()];

    if (!txModel) {
      throw new Error(`Transaction model not found for ${this.modelName}`);
    }

    // @ts-ignore - We're creating a new instance with the transaction model
    return new (this.constructor as any)(
      txModel,
      this.modelName,
      this.softDeleteConfig,
      tx,
      this.trackingConfig,
      this.auditLogger,
    );
  }

  /**
   * Tracks method execution for metrics and auditing
   */
  protected async trackExecution<T>(
    operationName: string,
    executeFunc: () => Promise<T>,
    data?: any,
  ): Promise<T> {
    const startTime = Date.now();
    let result: T;
    let error: Error | null = null;

    try {
      result = await executeFunc();
      return result;
    } catch (e: any) {
      error = e;
      throw e;
    } finally {
      const duration = Date.now() - startTime;

      // Performance tracking
      if (this.trackingConfig.trackPerformance) {
        if (duration > this.trackingConfig.slowOperationThreshold) {
          this.logger.warn(
            `Slow operation detected: ${operationName} took ${duration}ms`,
            {
              operationName,
              duration,
              slowThreshold: this.trackingConfig.slowOperationThreshold,
            },
          );
        } else {
          this.logger.debug(
            `Operation ${operationName} completed in ${duration}ms`,
          );
        }
      }

      // Audit logging
      if (this.trackingConfig.trackAuditing) {
        this.auditLogger.info(`Repository operation: ${operationName}`, {
          repository: this.modelName,
          operation: operationName,
          duration,
          success: !error,
          error: error?.message,
          ...(data && { data }),
        });
      }
    }
  }

  // ---------------------------
  //          HOOKS
  // ---------------------------

  registerPreHook<D>(operationName: string, hook: PreHook<D>): void {
    if (!this.preHooks[operationName]) {
      this.preHooks[operationName] = [];
    }
    this.preHooks[operationName].push(hook as PreHook);
  }

  registerPostHook<D>(operationName: string, hook: PostHook<D>): void {
    if (!this.postHooks[operationName]) {
      this.postHooks[operationName] = [];
    }
    this.postHooks[operationName].push(hook as PostHook);
  }

  // Add validation-specific hooks
  registerValidationHook<D>(
    operationName: string,
    validator: (data: D) => Promise<ValidationResult>,
  ): void {
    this.registerPreHook<D>(operationName, async (data) => {
      const result = await validator(data);
      if (!result.valid) {
        throw new ValidationError(
          `Validation failed for ${operationName}`,
          result.errors,
        );
      }
      return data;
    });
  }

  private async executePreHooks<D>(operationName: string, data: D): Promise<D> {
    let result = data;
    if (this.preHooks[operationName]) {
      for (const hook of this.preHooks[operationName]) {
        result = await hook(result);
      }
    }
    return result;
  }

  private async executePostHooks<R>(
    operationName: string,
    result: R,
  ): Promise<R> {
    let finalResult = result;
    if (this.postHooks[operationName]) {
      for (const hook of this.postHooks[operationName]) {
        finalResult = await hook(finalResult);
      }
    }
    return finalResult;
  }

  // ---------------------------
  //         CRUD METHODS
  // ---------------------------

  /**
   * Find entity by unique input (rather than by a numeric/string "id").
   * Example usage:
   *   findByUnique({ id: 123 }, { select: { name: true }})
   */
  async findByUnique(
    where: TWhereUnique,
    options?: {
      select?: TSelect;
      include?: TInclude;
    },
  ): Promise<TModel | null> {
    const operationName = 'findByUnique';
    const processedOptions = await this.executePreHooks(
      operationName,
      options ?? {},
    );

    return this.trackExecution(
      operationName,
      async () => {
        const result = await executeDbOperation(
          () =>
            this.model.findUnique({
              where,
              ...((processedOptions.select || processedOptions.include) &&
                processedOptions),
            }),
          `${this.modelName}.${operationName}`,
          this.logger,
          { where },
        );
        return this.executePostHooks(operationName, result);
      },
      { where },
    );
  }

  // Add these methods to the class
  async findById(id: string | number): Promise<TModel | null> {
    return this.findByUnique({ id } as TWhereUnique);
  }

  async findByIdOrThrow(id: string | number): Promise<TModel> {
    const result = await this.findById(id);
    if (!result) throw new RecordNotFoundError(this.modelName);
    return result;
  }

  /**
   * Find many entities with advanced pagination, ordering, select, include.
   *
   * Returns data, total count, and pagination information.
   */
  async findAll<TCursor = TWhereUnique>(
    where: TWhere = {} as TWhere,
    options?: QueryOptions<TOrderBy, TSelect, TInclude>,
  ): Promise<{
    data: TModel[];
    total: number;
    hasMore?: boolean;
    nextCursor?: TCursor;
    pageInfo?: {
      currentPage: number;
      totalPages: number;
      hasNextPage: boolean;
      hasPreviousPage: boolean;
    };
  }> {
    const operationName = 'findAll';
    const processedWhere = await this.executePreHooks(
      `${operationName}Where`,
      where,
    );
    const processedOptions = await this.executePreHooks(
      operationName,
      options ?? {},
    );

    return this.trackExecution(
      operationName,
      async () => {
        const findManyArgs: any = {
          where: processedWhere,
        };

        // Add orderBy, select, include if provided
        if (processedOptions.orderBy)
          findManyArgs.orderBy = processedOptions.orderBy;
        if (processedOptions.select)
          findManyArgs.select = processedOptions.select;
        if (processedOptions.include)
          findManyArgs.include = processedOptions.include;

        // Handle different pagination strategies
        const pagination = processedOptions.pagination || {
          strategy: 'offset',
          page: 1,
          pageSize: 10,
        };

        if (pagination.strategy === 'cursor' && 'cursor' in pagination) {
          // Cursor-based pagination
          if (pagination.cursor) findManyArgs.cursor = pagination.cursor;
          if (pagination.take) findManyArgs.take = pagination.take;
          // We'll also request one more record than needed to determine if there are more results
          findManyArgs.take = (pagination.take || 10) + 1;
        } else if (pagination.strategy === 'offset' && 'page' in pagination) {
          // Offset-based pagination
          const page = pagination.page || 1;
          const pageSize = pagination.pageSize || 10;
          findManyArgs.skip = (page - 1) * pageSize;
          findManyArgs.take = pageSize;
        }

        // Execute the query
        const [rawData, total] = await executeDbOperation(
          () =>
            Promise.all([
              this.model.findMany(findManyArgs),
              this.model.count({ where: processedWhere }),
            ]),
          `${this.modelName}.${operationName}`,
          this.logger,
          { where: processedWhere, options: findManyArgs },
        );

        // Process pagination results
        let data = rawData;
        let hasMore = false;
        let nextCursor: any = undefined;
        let pageInfo: any = undefined;

        if (pagination.strategy === 'cursor' && 'take' in pagination) {
          const take = pagination.take || 10;
          hasMore = data.length > take;

          // If we have more results than requested, remove the extra one and set the next cursor
          if (hasMore) {
            data = data.slice(0, take);
            nextCursor = { id: data[data.length - 1]?.id }; // Adjust based on your cursor field
          }
        } else if (pagination.strategy === 'offset' && 'page' in pagination) {
          const page = pagination.page || 1;
          const pageSize = pagination.pageSize || 10;
          const totalPages = Math.ceil(total / pageSize);

          pageInfo = {
            currentPage: page,
            totalPages,
            hasNextPage: page < totalPages,
            hasPreviousPage: page > 1,
          };
        }

        const result = {
          data,
          total,
          ...(hasMore !== undefined && { hasMore }),
          ...(nextCursor !== undefined && { nextCursor }),
          ...(pageInfo !== undefined && { pageInfo }),
        };

        return this.executePostHooks(operationName, result);
      },
      { where: processedWhere, options: processedOptions },
    );
  }

  /**
   * Find first entity matching a filter
   */
  async findOne(
    where: TWhere,
    options?: {
      orderBy?: TOrderBy | TOrderBy[];
      select?: TSelect;
      include?: TInclude;
    },
  ): Promise<TModel | null> {
    const operationName = 'findOne';

    const processedWhere = await this.executePreHooks(
      `${operationName}Where`,
      where,
    );
    const processedOptions = await this.executePreHooks(
      operationName,
      options ?? {},
    );

    return this.trackExecution(
      operationName,
      async () => {
        const result = await executeDbOperation(
          () =>
            this.model.findFirst({
              where: processedWhere,
              ...((processedOptions.orderBy ||
                processedOptions.select ||
                processedOptions.include) &&
                processedOptions),
            }),
          `${this.modelName}.${operationName}`,
          this.logger,
          { where: processedWhere },
        );

        return this.executePostHooks(operationName, result);
      },
      { where: processedWhere },
    );
  }

  /**
   * Create a new entity
   */
  async create(
    data: TCreate,
    options?: {
      select?: TSelect;
      include?: TInclude;
    },
  ): Promise<TModel> {
    const operationName = 'create';

    // If using soft deletes, ensure default "deleted" flags are set
    const initialData: any = {
      ...data,
    };
    if (this.softDeleteConfig.useDeletedFlag) {
      initialData.deleted = false;
    }
    if (this.softDeleteConfig.useDeletedAt) {
      initialData.deletedAt = null;
    }

    const processedData = await this.executePreHooks(
      operationName,
      initialData,
    );

    return this.trackExecution(
      operationName,
      async () => {
        const result = await executeDbOperation(
          () =>
            this.model.create({
              data: processedData,
              ...((options?.select || options?.include) && options),
            }),
          `${this.modelName}.${operationName}`,
          this.logger,
          { data: processedData },
        );
        return this.executePostHooks(operationName, result);
      },
      { data: processedData },
    );
  }

  /**
   * Create multiple entities (returns a count, not the created records).
   * Post-hooks receive `{ count: number }`.
   */
  async createMany(
    data: TCreate[],
    options?: {
      skipDuplicates?: boolean;
    },
  ): Promise<number> {
    const operationName = 'createMany';

    const initialDataArray = data.map((item) => {
      const d: any = { ...item };
      if (this.softDeleteConfig.useDeletedFlag) {
        d.deleted = false;
      }
      if (this.softDeleteConfig.useDeletedAt) {
        d.deletedAt = null;
      }
      return d;
    });

    const processedDataArray = await this.executePreHooks(
      operationName,
      initialDataArray,
    );

    return this.trackExecution(
      operationName,
      async () => {
        const result = await executeDbOperation(
          () =>
            this.model.createMany({
              data: processedDataArray,
              skipDuplicates: options?.skipDuplicates ?? false,
            }),
          `${this.modelName}.${operationName}`,
          this.logger,
          { dataCount: processedDataArray.length },
        );

        // Call post-hooks with `{ count: number }`
        const finalResult = await this.executePostHooks(operationName, {
          count: result.count,
        });
        return finalResult.count;
      },
      { dataCount: processedDataArray.length },
    );
  }

  /**
   * Update an entity by unique criteria
   */
  async update(
    where: TWhereUnique,
    data: TUpdate,
    options?: {
      select?: TSelect;
      include?: TInclude;
    },
  ): Promise<TModel> {
    const operationName = 'update';

    const processedData = await this.executePreHooks(operationName, data);

    return this.trackExecution(
      operationName,
      async () => {
        const result = await executeDbOperation(
          () =>
            this.model.update({
              where,
              data: processedData,
              ...((options?.select || options?.include) && options),
            }),
          `${this.modelName}.${operationName}`,
          this.logger,
          { where, data: processedData },
        );

        return this.executePostHooks(operationName, result);
      },
      { where, data: processedData },
    );
  }

  /**
   * Update multiple entities matching a filter. Returns count.
   * Post-hooks receive `{ count: number }`.
   */
  async updateMany(where: TWhere, data: TUpdate): Promise<number> {
    const operationName = 'updateMany';

    const processedWhere = await this.executePreHooks(
      `${operationName}Where`,
      where,
    );
    const processedData = await this.executePreHooks(operationName, data);

    return this.trackExecution(
      operationName,
      async () => {
        const result = await executeDbOperation(
          () =>
            this.model.updateMany({
              where: processedWhere,
              data: processedData,
            }),
          `${this.modelName}.${operationName}`,
          this.logger,
          { where: processedWhere, data: processedData },
        );

        const finalResult = await this.executePostHooks(operationName, {
          count: result.count,
        });
        return finalResult.count;
      },
      { where: processedWhere, data: processedData },
    );
  }

  /**
   * Connect relations to an entity (useful for many-to-many relationships)
   *
   * @param id The ID of the record to connect relations to
   * @param relationField The name of the relation field
   * @param relationIds IDs of the related records to connect
   */
  async connectRelations<TId = string | number>(
    id: TId,
    relationField: string,
    relationIds: TId[],
  ): Promise<TModel> {
    const operationName = 'connectRelations';

    // Handle empty array case
    if (!relationIds.length) {
      return this.findByUnique({
        id,
      } as any as TWhereUnique) as Promise<TModel>;
    }

    // Create connection payload
    const connectionData: any = {
      [relationField]: {
        connect: relationIds.map((relId) => ({ id: relId })),
      },
    };

    return this.trackExecution(
      operationName,
      async () => {
        return executeDbOperation(
          () =>
            this.model.update({
              where: { id } as any,
              data: connectionData,
            }),
          `${this.modelName}.${operationName}`,
          this.logger,
          { id, relationField, relationIds },
        );
      },
      { id, relationField, relationIds },
    );
  }

  /**
   * Disconnect relations from an entity (useful for many-to-many relationships)
   *
   * @param id The ID of the record to disconnect relations from
   * @param relationField The name of the relation field
   * @param relationIds IDs of the related records to disconnect
   */
  async disconnectRelations<TId = string | number>(
    id: TId,
    relationField: string,
    relationIds: TId[],
  ): Promise<TModel> {
    const operationName = 'disconnectRelations';

    // Handle empty array case
    if (!relationIds.length) {
      return this.findByUnique({
        id,
      } as any as TWhereUnique) as Promise<TModel>;
    }

    // Create disconnection payload
    const disconnectionData: any = {
      [relationField]: {
        disconnect: relationIds.map((relId) => ({ id: relId })),
      },
    };

    return this.trackExecution(
      operationName,
      async () => {
        return executeDbOperation(
          () =>
            this.model.update({
              where: { id } as any,
              data: disconnectionData,
            }),
          `${this.modelName}.${operationName}`,
          this.logger,
          { id, relationField, relationIds },
        );
      },
      { id, relationField, relationIds },
    );
  }

  /**
   * Set relations on an entity (replaces existing relations)
   *
   * @param id The ID of the record to set relations on
   * @param relationField The name of the relation field
   * @param relationIds IDs of the related records to set
   */
  async setRelations<TId = string | number>(
    id: TId,
    relationField: string,
    relationIds: TId[],
  ): Promise<TModel> {
    const operationName = 'setRelations';

    // Create set payload
    const setData: any = {
      [relationField]: {
        set: relationIds.map((relId) => ({ id: relId })),
      },
    };

    return this.trackExecution(
      operationName,
      async () => {
        return executeDbOperation(
          () =>
            this.model.update({
              where: { id } as any,
              data: setData,
            }),
          `${this.modelName}.${operationName}`,
          this.logger,
          { id, relationField, relationIds },
        );
      },
      { id, relationField, relationIds },
    );
  }

  /**
   * Soft delete a single entity by unique criteria.
   */
  async softDelete(
    where: TWhereUnique,
    options?: {
      select?: TSelect;
      include?: TInclude;
    },
  ): Promise<TModel> {
    const operationName = 'softDelete';

    // Ensure we're only soft deleting an entity that is "notDeleted"
    const combinedWhere = {
      ...where,
      ...this.getNotDeletedFilter(),
    } as TWhereUnique & Partial<TWhere>;

    const deleteData = this.getSoftDeleteData();
    const processedData = await this.executePreHooks(operationName, deleteData);

    return this.trackExecution(
      operationName,
      async () => {
        try {
          const result = await executeDbOperation(
            () =>
              this.model.update({
                where: combinedWhere,
                data: processedData,
                ...((options?.select || options?.include) && options),
              }),
            `${this.modelName}.${operationName}`,
            this.logger,
            { where: combinedWhere, data: processedData },
          );
          return this.executePostHooks(operationName, result);
        } catch (error: any) {
          if (error instanceof DatabaseError && error.cause?.name === 'P2025') {
            this.logger.warn(`Record not found or already soft-deleted`, {
              where,
            });
          }
          throw error;
        }
      },
      { where: combinedWhere, data: processedData },
    );
  }

  /**
   * Soft delete multiple entities matching a filter. Returns count.
   * Post-hooks receive `{ count: number }`.
   */
  async softDeleteMany(where: TWhere): Promise<number> {
    const operationName = 'softDeleteMany';

    const combinedWhere = {
      ...where,
      ...this.getNotDeletedFilter(),
    };

    const deleteData = this.getSoftDeleteData();
    const processedData = await this.executePreHooks(operationName, deleteData);

    return this.trackExecution(
      operationName,
      async () => {
        const result = await executeDbOperation(
          () =>
            this.model.updateMany({
              where: combinedWhere,
              data: processedData,
            }),
          `${this.modelName}.${operationName}`,
          this.logger,
          { where: combinedWhere, data: processedData },
        );

        const finalResult = await this.executePostHooks(operationName, {
          count: result.count,
        });
        return finalResult.count;
      },
      { where: combinedWhere, data: processedData },
    );
  }

  /**
   * Permanently delete a single entity
   */
  async hardDelete(where: TWhereUnique): Promise<TModel> {
    const operationName = 'hardDelete';

    return this.trackExecution(
      operationName,
      async () => {
        const result = await executeDbOperation(
          () => this.model.delete({ where }),
          `${this.modelName}.${operationName}`,
          this.logger,
          { where },
        );
        return this.executePostHooks(operationName, result);
      },
      { where },
    );
  }

  /**
   * Permanently delete multiple entities matching a filter. Returns count.
   * Post-hooks receive `{ count: number }`.
   */
  async hardDeleteMany(where: TWhere): Promise<number> {
    const operationName = 'hardDeleteMany';

    return this.trackExecution(
      operationName,
      async () => {
        const result = await executeDbOperation(
          () => this.model.deleteMany({ where }),
          `${this.modelName}.${operationName}`,
          this.logger,
          { where },
        );
        const finalResult = await this.executePostHooks(operationName, {
          count: result.count,
        });
        return finalResult.count;
      },
      { where },
    );
  }

  /**
   * Restore a soft-deleted single entity
   */
  async restore(
    where: TWhereUnique,
    options?: {
      select?: TSelect;
      include?: TInclude;
    },
  ): Promise<TModel> {
    const operationName = 'restore';

    const combinedWhere = {
      ...where,
      ...this.getDeletedFilter(),
    } as TWhereUnique & Partial<TWhere>;

    const restoreData = this.getRestoreData();
    const processedData = await this.executePreHooks(
      operationName,
      restoreData,
    );

    return this.trackExecution(
      operationName,
      async () => {
        try {
          const result = await executeDbOperation(
            () =>
              this.model.update({
                where: combinedWhere,
                data: processedData,
                ...((options?.select || options?.include) && options),
              }),
            `${this.modelName}.${operationName}`,
            this.logger,
            { where: combinedWhere, data: processedData },
          );
          return this.executePostHooks(operationName, result);
        } catch (error: any) {
          if (error instanceof DatabaseError && error.cause?.name === 'P2025') {
            this.logger.warn(`Record not found or not soft-deleted`, { where });
          }
          throw error;
        }
      },
      { where: combinedWhere, data: processedData },
    );
  }

  /**
   * Restore multiple soft-deleted entities matching a filter. Returns count.
   * Post-hooks receive `{ count: number }`.
   */
  async restoreMany(where: TWhere): Promise<number> {
    const operationName = 'restoreMany';

    const combinedWhere = {
      ...where,
      ...this.getDeletedFilter(),
    };

    const restoreData = this.getRestoreData();
    const processedData = await this.executePreHooks(
      operationName,
      restoreData,
    );

    return this.trackExecution(
      operationName,
      async () => {
        const result = await executeDbOperation(
          () =>
            this.model.updateMany({
              where: combinedWhere,
              data: processedData,
            }),
          `${this.modelName}.${operationName}`,
          this.logger,
          { where: combinedWhere, data: processedData },
        );

        const finalResult = await this.executePostHooks(operationName, {
          count: result.count,
        });
        return finalResult.count;
      },
      { where: combinedWhere, data: processedData },
    );
  }

  /**
   * Count the number of records matching a filter
   */
  async count(where: TWhere = {} as TWhere): Promise<number> {
    const operationName = 'count';

    const processedWhere = await this.executePreHooks(
      `${operationName}Where`,
      where,
    );

    return this.trackExecution(
      operationName,
      async () => {
        return executeDbOperation(
          () => this.model.count({ where: processedWhere }),
          `${this.modelName}.${operationName}`,
          this.logger,
          { where: processedWhere },
        );
      },
      { where: processedWhere },
    );
  }

  /**
   * Check if an entity exists for a given filter
   */
  async exists(where: TWhere): Promise<boolean> {
    const operationName = 'exists';
    return this.trackExecution(
      operationName,
      async () => {
        const c = await this.count(where);
        return c > 0;
      },
      { where },
    );
  }

  /**
   * Upsert: Create if not found, otherwise update.
   *
   * By default, we run separate pre-hooks for the create data vs update data:
   *   - 'upsertCreate'
   *   - 'upsertUpdate'
   * Then a single post-hook for the final record: 'upsert'
   */
  async upsert(
    where: TWhereUnique,
    createData: TCreate,
    updateData: TUpdate,
    options?: {
      select?: TSelect;
      include?: TInclude;
    },
  ): Promise<TModel> {
    const operationName = 'upsert';

    // Prepare create fields for soft deletes
    const initialCreateData: any = { ...createData };
    if (this.softDeleteConfig.useDeletedFlag) {
      initialCreateData.deleted = false;
    }
    if (this.softDeleteConfig.useDeletedAt) {
      initialCreateData.deletedAt = null;
    }

    // Execute hooks separately if you want finer-grained logic
    const finalCreateData = await this.executePreHooks(
      'upsertCreate',
      initialCreateData,
    );
    const finalUpdateData = await this.executePreHooks(
      'upsertUpdate',
      updateData,
    );

    return this.trackExecution(
      operationName,
      async () => {
        const result = await executeDbOperation(
          () =>
            this.model.upsert({
              where,
              create: finalCreateData,
              update: finalUpdateData,
              ...((options?.select || options?.include) && options),
            }),
          `${this.modelName}.${operationName}`,
          this.logger,
          { where, createData: finalCreateData, updateData: finalUpdateData },
        );

        return this.executePostHooks(operationName, result);
      },
      { where, createData: finalCreateData, updateData: finalUpdateData },
    );
  }

  /**
   * Bulk upsert - efficiently upsert multiple records
   * Use this when you need to insert or update many records at once
   *
   * @param records Array of records to create or update
   * @param uniqueFields Array of fields that uniquely identify each record
   */
  async bulkUpsert(
    records: Array<TCreate & Partial<{ id: string | number }>>,
    uniqueFields: string[] = ['id'],
  ): Promise<{ count: number }> {
    const operationName = 'bulkUpsert';

    if (!records.length) {
      return { count: 0 };
    }

    return this.trackExecution(
      operationName,
      async () => {
        // Process records through pre-hooks
        const processedRecords = await this.executePreHooks(
          operationName,
          records,
        );

        // For each record, we'll perform an individual upsert using Prisma transaction
        // This is more efficient than separate operations
        const result = await executeDbOperation(
          async () => {
            // We need prisma client for this operation
            if (!this.prisma) {
              throw new Error('Prisma client not provided to repository');
            }

            // Batch them in a transaction
            return this.prisma.$transaction(
              processedRecords.map((record: any) => {
                // Build the unique constraint object from the provided fields
                const where: any = {};
                for (const field of uniqueFields) {
                  if (record[field] !== undefined) {
                    where[field] = record[field];
                  }
                }

                // Separate id from the data if it exists
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                const { id, ...createData } = record;

                // For create data, ensure soft delete flags are set
                const finalCreateData: any = { ...createData };
                if (this.softDeleteConfig.useDeletedFlag) {
                  finalCreateData.deleted = false;
                }
                if (this.softDeleteConfig.useDeletedAt) {
                  finalCreateData.deletedAt = null;
                }

                // Return the upsert operation
                return this.model.upsert({
                  where,
                  create: finalCreateData,
                  update: createData,
                });
              }),
            );
          },
          `${this.modelName}.${operationName}`,
          this.logger,
          { recordCount: records.length },
        );

        const countResult = {
          count: Array.isArray(result) ? result.length : 0,
        };
        return this.executePostHooks(operationName, countResult);
      },
      { recordCount: records.length },
    );
  }

  /**
   * Find deleted entities (for admin/recovery purposes)
   */
  async findDeleted(
    where: TWhere = {} as TWhere,
    options?: QueryOptions<TOrderBy, TSelect, TInclude>,
  ): Promise<{
    data: TModel[];
    total: number;
    hasMore?: boolean;
    nextCursor?: any;
    pageInfo?: any;
  }> {
    const operationName = 'findDeleted';

    // Combine user-provided filter with "deleted" filter
    const combinedWhere = {
      ...where,
      ...this.getDeletedFilter(),
    };

    // Use the findAll method with the combined where clause to reuse pagination logic
    const result = await this.findAll(combinedWhere, options);

    // Override the operation name for hooks
    return this.executePostHooks(operationName, result);
  }
}

// Create repository factory
const repositoryFactory = new RepositoryFactory(prisma);

// Export factory for use throughout your application
export { repositoryFactory };
