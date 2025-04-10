import { PrismaClient } from '@prisma/client';

import { config } from '@/config/index.js';
import { cache, NO_CACHE_ID } from '@/libs/cache.js'; // Assuming cache is correctly set up

import {
  generatePrismaCacheKey,
  serializePrismaData,
  deserializePrismaData,
} from './cache-utils.js'; // Import helpers
import { logger } from './logger.js'; // Assuming logger is correctly set up

// Determine logging levels based on environment
const LOG_LEVELS =
  process.env['NODE_ENV'] === 'production'
    ? ['warn', 'error'] // Less verbose in production
    : ['query', 'info', 'warn', 'error']; // More verbose in development/test

// Determine error format based on environment
const ERROR_FORMAT = config.logging.format;

// Instantiate Prisma Client ONCE with configured logging and error format
const prisma: PrismaClient = new PrismaClient({
  log: LOG_LEVELS,
  errorFormat: ERROR_FORMAT,
});

// Define operations suitable for caching (Read operations)
const CACHEABLE_OPERATIONS = [
  'findUnique',
  'findUniqueOrThrow',
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'count',
  'aggregate',
  'groupBy',
];

// Define operations that should potentially invalidate cache (Write operations)
const INVALIDATING_OPERATIONS = [
  'create',
  'createMany',
  'update',
  'updateMany',
  'upsert',
  'delete',
  'deleteMany',
];

logger.info(
  `Initializing Prisma Client with log level(s): [${LOG_LEVELS.join(', ')}] and error format: '${ERROR_FORMAT}'`,
);

// --- Caching Middleware ---
prisma.$use(
  async (
    params: { model: any; action: string; args: any },
    next: (arg0: any) => any,
  ) => {
    // Only apply caching to specified models and cacheable operations
    if (params.model && CACHEABLE_OPERATIONS.includes(params.action)) {
      // Ensure the cache is enabled and available
      if (cache?.cacheId() === NO_CACHE_ID) {
        logger.warn(
          `[Cache Middleware] Cache is disabled, skipping cache for ${params.model}.${params.action}`,
        );
        return next(params);
      }

      const cacheKey = generatePrismaCacheKey({
        model: params.model,
        operation: params.action,
        queryArgs: params.args,

        // We do not really need namespace here as we already have namespaced the cache using Keyv
        // namespace: config.cache.namespace, // Use namespace from your config
      });

      try {
        const cachedResult = await cache.get<string>(cacheKey); // Expect string from cache

        if (cachedResult !== null && cachedResult !== undefined) {
          logger.info(
            `[Cache Middleware] HIT: ${params.model}.${params.action} (Key: ${cacheKey})`,
          );
          try {
            return deserializePrismaData(cachedResult); // Deserialize
          } catch (e) {
            logger.error(
              `[Cache Middleware] Failed to deserialize data for key ${cacheKey}`,
              e,
            );
            // Proceed without cache if deserialization fails
            await cache.del(cacheKey); // Delete potentially corrupted cache entry
          }
        }
      } catch (e) {
        // Proceed without cache if there's an error
        logger.error(
          `[Cache Middleware] Cache GET error for key ${cacheKey}`,
          e,
        );
      }

      // Cache MISS or error during GET/deserialize
      logger.info(
        `[Cache Middleware] MISS: ${params.model}.${params.action} (Key: ${cacheKey})`,
      );
      const result = await next(params); // Execute the actual database query

      if (result !== null && result !== undefined) {
        try {
          const serializedResult = serializePrismaData(result); // Serialize
          // Use the default TTL from your cache configuration
          await cache.set(
            cacheKey,
            serializedResult,
            // we aleady have a default TTL in the cache manager
            // config.cache.defaultTtlMs,
          );
          logger.info(
            `[Cache Middleware] SET: ${params.model}.${params.action} (Key: ${cacheKey})`,
          );
        } catch (e) {
          // Don't fail the operation if caching fails
          logger.error(
            `[Cache Middleware] Cache SET error or serialization error for key ${cacheKey}`,
            e,
          );
        }
      }
      return result; // Return the result from the database
    } else if (
      params.model &&
      INVALIDATING_OPERATIONS.includes(params.action)
    ) {
      // --- Cache Invalidation Logic (Simple Logging for now) ---
      // Execute the write operation FIRST
      const result = await next(params);

      // After the write is successful, log potential invalidation need.
      // A robust implementation would involve deleting specific keys/patterns
      // or using cache tags if supported by your ProjectCache and underlying stores.
      // Since ProjectCache doesn't explicitly support pattern deletion/tagging,
      // we'll just log for now.
      logger.warn(
        `[Cache Middleware] Write operation ${params.model}.${params.action} occurred. Consider cache invalidation strategies for model '${params.model}'.`,
      );
      // Example (if you had pattern deletion): await cache.delPattern(`${config.cache.namespace}:${params.model}:*`);

      return result;
    }

    // For operations not matching cacheable reads or invalidating writes, just proceed
    return next(params);
  },
);
// --- End Caching Middleware ---

prisma.$on('error', (error: any) => {
  logger.error(error, 'Prisma Client error event');
  // Handle error event (e.g., log it, send alert, etc.)
});
prisma.$on('query', (e: { query: any; duration: any; params: any }) => {
  logger.info(
    `Query: ${e.query} - Duration: ${e.duration}ms - Parameters: ${JSON.stringify(e.params)}`,
  );
});
prisma.$on('info', (e: { message: any }) => {
  logger.info(`Prisma Client info event: ${e.message}`);
});
prisma.$on('warn', (e: { message: any }) => {
  logger.warn(`Prisma Client warning event: ${e.message}`);
});
prisma.$on('beforeExit', async () => {
  logger.info('Prisma Client is about to exit. Cleaning up...');
  // Perform any necessary cleanup before exiting
  // For example, you might want to close database connections or clear caches
  await prisma.$disconnect();
  logger.info('Prisma Client disconnected successfully.');
  // Exit the process
  process.exit(0);
});
prisma.$on('afterExit', () => {
  logger.info('Prisma Client has exited.');
  // Perform any necessary actions after the client has exited
  // For example, you might want to log the exit or perform cleanup tasks
  // Note: This is not a common use case, but you can add your logic here
});

logger.info('Prisma Client instantiated successfully.');

// --- Graceful Shutdown Logic ---

let isShuttingDown = false; // Flag to prevent multiple shutdown attempts

/**
 * Graceful shutdown handler for Prisma Client.
 * Ensures database connections are closed properly when the application terminates.
 * This is crucial for preventing connection leaks, especially in containerized environments.
 *
 * @param signal The signal received (e.g., 'SIGINT', 'SIGTERM')
 */
async function gracefulShutdown(signal: string) {
  if (isShuttingDown) {
    logger.warn('Shutdown already in progress. Ignoring signal.');
    return;
  }
  isShuttingDown = true;
  logger.warn(`Received ${signal}. Disconnecting Prisma Client...`);
  try {
    await prisma.$disconnect();
    logger.info(
      'Prisma Client disconnected successfully due to app termination.',
    );
    process.exit(0); // Exit cleanly after disconnect
  } catch (e) {
    logger.error(
      e,
      'Error during Prisma Client disconnection during shutdown.',
    );
    process.exit(1); // Exit with error code
  }
}

// Listen for termination signals sent by the OS or orchestrators like Cloud Run / Kubernetes
// eslint-disable-next-line @typescript-eslint/no-misused-promises
process.on('SIGINT', async () => {
  await gracefulShutdown('SIGINT');
}); // Signal for Ctrl+C
// eslint-disable-next-line @typescript-eslint/no-misused-promises
process.on('SIGTERM', async () => await gracefulShutdown('SIGTERM')); // Standard termination signal

// Export the singleton instance for use throughout the application
export default prisma;
