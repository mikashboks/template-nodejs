// src/services/product.service.ts
import { PrismaClient, Prisma } from '@prisma/client';
import { logger } from '../libs/logger.js';
import { CloudRunError } from '../utils/error-handler.js';
import { config } from '../config/index.js';

// Types
interface ProductQuery {
  page: number;
  limit: number;
  search?: string;
  categoryId?: string;
  minPrice?: number;
  maxPrice?: number;
  isActive?: boolean;
  sortBy: 'name' | 'price' | 'createdAt';
  sortOrder: 'asc' | 'desc';
}

interface CreateProductInput {
  name: string;
  description?: string;
  price: number;
  sku: string;
  stock: number;
  categoryIds?: string[];
}

interface UpdateProductInput extends Partial<CreateProductInput> {
  isActive?: boolean;
}

interface ServiceOptions {
  signal?: AbortSignal;
}

/**
 * Product service with Cloud Run optimizations
 */
export class ProductService {
  private prisma: PrismaClient;
  
  constructor() {
    // Create a new PrismaClient instance for each request for better isolation
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
      logger.error({ err }, 'Error disconnecting from database');
    }
  }

  /**
   * Find products with pagination and filtering
   * Optimized for Cloud Run with efficient queries and connection handling
   */
  public async findProducts(
    query: ProductQuery,
    options: ServiceOptions = {}
  ): Promise<{ data: any[]; total: number; page: number; limit: number; totalPages: number }> {
    try {
      // Check for abort signal
      if (options.signal?.aborted) {
        throw new Error('Request aborted');
      }
      
      const { 
        page, 
        limit, 
        search, 
        categoryId, 
        minPrice, 
        maxPrice, 
        isActive, 
        sortBy, 
        sortOrder 
      } = query;
      
      // Start performance measurement
      const startTime = Date.now();
      
      // Calculate pagination
      const skip = (page - 1) * limit;
      
      // Build filter conditions
      const where: Prisma.ProductWhereInput = {};
      
      // Add search condition if provided
      if (search) {
        where.OR = [
          { name: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
          { sku: { contains: search, mode: 'insensitive' } }
        ];
      }
      
      // Add category filter if provided
      if (categoryId) {
        where.categories = {
          some: { id: categoryId }
        };
      }
      
      // Add price range filters if provided
      if (minPrice !== undefined) {
        where.price = { ...where.price, gte: minPrice };
      }
      
      if (maxPrice !== undefined) {
        where.price = { ...where.price, lte: maxPrice };
      }
      
      // Add active status filter if provided
      if (isActive !== undefined) {
        where.isActive = isActive;
      }
      
      // Create transactions for concurrent queries
      const [products, total] = await this.prisma.$transaction([
        // Get products with pagination
        this.prisma.product.findMany({
          where,
          include: {
            categories: {
              select: {
                id: true,
                name: true,
                slug: true
              }
            },
            images: {
              where: { isMain: true },
              take: 1,
              select: {
                id: true,
                url: true,
                altText: true,
                isMain: true
              }
            }
          },
          skip,
          take: limit,
          orderBy: {
            [sortBy]: sortOrder
          }
        }),
        
        // Get total count for pagination
        this.prisma.product.count({ where })
      ], {
        // Set transaction timeout
        timeout: config().database.connectionTimeout
      });
      
      // Calculate total pages
      const totalPages = Math.ceil(total / limit);
      
      // Log performance metrics
      const duration = Date.now() - startTime;
      logger.debug({
        operation: 'findProducts',
        duration,
        resultCount: products.length,
        totalCount: total,
        query
      }, 'Product query completed');
      
      return {
        data: products,
        total,
        page,
        limit,
        totalPages
      };
    } catch (err) {
      // Handle specific Prisma errors
      if (err instanceof Prisma.PrismaClientKnownRequestError) {
        // Handle connection issues - important for Cloud Run
        if (err.code === 'P1001' || err.code === 'P1002') {
          logger.error({ err }, 'Database connection error');
          throw new CloudRunError('Database connection error', 503);
        }
        
        // Handle query timeout
        if (err.code === 'P1008') {
          logger.error({ err }, 'Database query timeout');
          throw new CloudRunError('Database query timeout', 504);
        }
      }
      
      // Handle abort error
      if (err.name === 'AbortError') {
        logger.warn('Request aborted');
        throw new CloudRunError('Request aborted', 499);
      }
      
      // Log unexpected errors
      logger.error({ err }, 'Error finding products');
      throw new CloudRunError('Error finding products', 500);
    }
  }

  /**
   * Find product by ID with related data
   */
  public async findProductById(id: string): Promise<any> {
    try {
      const product = await this.prisma.product.findUnique({
        where: { id },
        include: {
          categories: true,
          images: {
            orderBy: {
              sortOrder: 'asc'
            }
          }
        }
      });
      
      if (!product) {
        return null;
      }
      
      return product;
    } catch (err) {
      logger.error({ err, productId: id }, 'Error finding product by ID');
      
      if (err instanceof Prisma.PrismaClientKnownRequestError) {
        if (err.code === 'P2001' || err.code === 'P2025') {
          return null;
        }
      }
      
      throw new CloudRunError('Error finding product', 500);
    }
  }

  /**
   * Create a new product
   */
  public async createProduct(data: CreateProductInput): Promise<any> {
    try {
      const { categoryIds, ...productData } = data;
      
      // Use transactions for atomic operations
      const product = await this.prisma.$transaction(async (tx) => {
        // Create the product
        const newProduct = await tx.product.create({
          data: {
            ...productData,
            // Connect categories if provided
            ...(categoryIds && categoryIds.length > 0 ? {
              categories: {
                connect: categoryIds.map(id => ({ id }))
              }
            } : {})
          },
          include: {
            categories: true
          }
        });
        
        return newProduct;
      }, {
        // Set transaction timeout
        timeout: config().database.connectionTimeout,
        // Set isolation level
        isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted
      });
      
      return product;
    } catch (err) {
      logger.error({ err, productData: data }, 'Error creating product');
      
      // Handle specific Prisma errors
      if (err instanceof Prisma.PrismaClientKnownRequestError) {
        // Handle unique constraint violations
        if (err.code === 'P2002') {
          if (err.meta?.target === 'sku') {
            throw new CloudRunError('A product with this SKU already exists', 409);
          }
          throw new CloudRunError('Unique constraint violation', 409);
        }
        
        // Handle foreign key constraint violations
        if (err.code === 'P2003') {
          throw new CloudRunError('Invalid category ID(s)', 400);
        }
      }
      
      throw new CloudRunError('Error creating product', 500);
    }
  }

  /**
   * Update an existing product
   */
  public async updateProduct(id: string, data: UpdateProductInput): Promise<any> {
    try {
      const { categoryIds, ...updateData } = data;
      
      // First check if product exists
      const productExists = await this.prisma.product.findUnique({
        where: { id },
        select: { id: true }
      });
      
      if (!productExists) {
        return null;
      }
      
      // Use transactions for atomic operations
      const updatedProduct = await this.prisma.$transaction(async (tx) => {
        // Update the product
        const product = await tx.product.update({
          where: { id },
          data: {
            ...updateData,
            // Handle categories if provided
            ...(categoryIds !== undefined ? {
              categories: {
                // First disconnect all, then connect new ones
                set: [],
                connect: categoryIds.map(categoryId => ({ id: categoryId }))
              }
            } : {})
          },
          include: {
            categories: true,
            images: true
          }
        });
        
        return product;
      }, {
        timeout: config().database.connectionTimeout,
        isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted
      });
      
      return updatedProduct;
    } catch (err) {
      logger.error({ err, productId: id, updateData: data }, 'Error updating product');
      
      // Handle specific Prisma errors
      if (err instanceof Prisma.PrismaClientKnownRequestError) {
        // Handle not found errors
        if (err.code === 'P2025') {
          return null;
        }
        
        // Handle unique constraint violations
        if (err.code === 'P2002') {
          if (err.meta?.target === 'sku') {
            throw new CloudRunError('A product with this SKU already exists', 409);
          }
          throw new CloudRunError('Unique constraint violation', 409);
        }
        
        // Handle foreign key constraint violations
        if (err.code === 'P2003') {
          throw new CloudRunError('Invalid category ID(s)', 400);
        }
      }
      
      throw new CloudRunError('Error updating product', 500);
    }
  }

  /**
   * Delete a product
   */
  public async deleteProduct(id: string): Promise<boolean> {
    try {
      const product = await this.prisma.product.delete({
        where: { id }
      });
      
      return !!product;
    } catch (err) {
      logger.error({ err, productId: id }, 'Error deleting product');
      
      // Handle specific Prisma errors
      if (err instanceof Prisma.PrismaClientKnownRequestError) {
        // Handle not found errors
        if (err.code === 'P2025') {
          return false;
        }
        
        // Handle foreign key constraint violations
        if (err.code === 'P2003') {
          throw new CloudRunError('Cannot delete product: it is referenced by other records', 409);
        }
      }
      
      throw new CloudRunError('Error deleting product', 500);
    }
  }
}

export default ProductService;