import EventEmitter from 'node:events';

import KeyvRedis from '@keyv/redis';
import { createCache, type Cache } from 'cache-manager'; // Import Store type if needed later
import { CacheableMemory } from 'cacheable';
import { Keyv } from 'keyv';

// Import config and logger
import { logger } from './logger.js';
import { config } from '../config/index.js';

import type { AppConfig } from '@/config/index.js';

type Events = {
  // Define your event types here if needed
};

const noOpCache: Cache = {
  async get<T>(): Promise<T | null> {
    return null;
  },

  async mget<T>(keys: string[]): Promise<Array<T | null>> {
    return Array(keys.length).fill(null);
  },

  async ttl(): Promise<number | null> {
    return null;
  },

  async set<T>(_key: string, value: T): Promise<T> {
    return value;
  },

  async mset<T>(
    list: Array<{ key: string; value: T; ttl?: number }>,
  ): Promise<typeof list> {
    return list;
  },

  async del(): Promise<boolean> {
    return true;
  },

  async mdel(): Promise<boolean> {
    return true;
  },

  async clear(): Promise<boolean> {
    return true;
  },

  on<_E extends keyof Events>(): EventEmitter {
    return this as unknown as EventEmitter;
  },

  off<_E extends keyof Events>(): EventEmitter {
    return this as unknown as EventEmitter;
  },

  async disconnect(): Promise<undefined> {
    return undefined;
  },

  cacheId(): string {
    return 'no-op-cache';
  },

  stores: [],

  async wrap<T>(_key: string, fnc: () => T | Promise<T>): Promise<T> {
    return Promise.resolve().then(fnc);
  },
};

// --- No-Op Cache Implementation ---
// Returned when config.cache.enabled is false
// --- Cache Creation Function ---
// Accepts the cache section of AppConfig
export function createProjectCache(config: AppConfig['cache']): Cache {
  // 1. Check if cache is globally disabled
  if (!config.enabled) {
    logger.warn('Application cache is disabled via configuration.');
    return noOpCache;
  }

  const stores: Keyv[] = []; // Use a union type if mixing Keyv and cache-manager stores

  // 2. Configure In-Memory Store (Always included if cache is enabled)
  const memoryStore = new Keyv({
    store: new CacheableMemory({
      ttl: config.memoryTtlMs, // Use memoryTtlMs for CacheableMemory
      lruSize: config.memoryLruSize, // Use memoryLruSize for CacheableMemory's maxSize
    }),
    namespace: config.namespace,
  });
  stores.push(memoryStore);

  // 3. Configure Redis Store (Conditional)
  let redisStore: KeyvRedis<any> | undefined;
  if (config.redisEnabled) {
    if (!config.redisUrl) {
      // Throw an error during startup if Redis is expected but not configured
      throw new Error(
        `Redis cache is enabled for namespace '${config.namespace}', but no REDIS_URL was provided in the configuration.`,
      );
    }

    try {
      redisStore = new KeyvRedis({
        url: config.redisUrl,
        // KeyvRedis doesn't have a built-in namespace option like this,
        // Keyv itself adds the namespace *prefix* to keys before they hit the store.
        // We will rely on the top-level Keyv instance for namespacing.
      });

      redisStore.on('error', (err: any) => {
        // Log more specifically
        logger.error(
          `Redis connection error for namespace '${config.namespace}':`,
          err,
        );
        // Potentially add logic here to degrade gracefully (e.g., stop using Redis)
        // For now, we just log.
      });

      // Wrap Redis store with Keyv to handle namespacing and potential future Keyv features
      const namespacedRedisKeyv = new Keyv({
        store: redisStore,
        namespace: config.namespace, // Apply namespace here
      });
      stores.push(namespacedRedisKeyv); // Add the namespaced Keyv instance
    } catch (error) {
      logger.error(
        `Failed to initialize Redis store for namespace '${config.namespace}':`,
        error,
      );
      // Decide behavior: throw, or continue without Redis? For resilience, let's log and continue without Redis.
      logger.warn(
        `Continuing without Redis cache for namespace '${config.namespace}' due to initialization error.`,
      );
    }
  } else {
    logger.info(
      `Redis cache explicitly disabled for namespace '${config.namespace}'.`,
    );
  }

  // 4. Configure cache-manager Multi-Caching
  // Note: cache-manager v5+ expects stores conforming to its specific Store interface.
  // Keyv instances might need adapters if strict compatibility is required,
  // but often work for basic get/set/del. Let's assume basic compatibility for now.
  // If issues arise, an adapter might be needed.
  const cache: Cache = createCache({
    stores, // Pass the configured stores
    // --- cache-manager specific options ---
    ttl: config.defaultTtlMs, // Default TTL for items (often primarily affects Redis tier)
    // refreshThreshold: config.refreshThresholdMs, // refreshThreshold needs specific store support
    nonBlocking: config.nonBlocking,
  });

  logger.info(
    `Project cache initialized for namespace '${config.namespace}' with ${stores.length > 1 ? 'Memory and Redis' : 'Memory only'} stores.`,
  );
  return cache;
}

// Create the cache instance using the loaded configuration
export const cache: Cache = createProjectCache(config.cache);
export const NO_CACHE_ID = 'no-op-cache';
