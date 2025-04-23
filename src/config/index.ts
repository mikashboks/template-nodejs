// src/config/index.ts
import { existsSync } from 'fs';
import path from 'path';

import { config as dotenvConfig } from 'dotenv';
import { z } from 'zod';

// Default TTL for cached results (5 minutes)
const DEFAULT_CACHE_TTL = 5 * 60 * 1000;

// --- Environment Loading (Keep your existing loadEnvConfig) ---
function loadEnvConfig(): void {
  // Get appropriate .env file based on environment
  const envFile =
    process.env['NODE_ENV'] === 'production'
      ? '.env.production'
      : process.env['NODE_ENV'] === 'test'
        ? '.env.test'
        : '.env';

  // Cloud Run specific env file takes precedence if it exists
  const cloudRunEnvFile = '.env.cloudrun';

  try {
    // Try Cloud Run specific file first if it exists
    if (existsSync(path.resolve(process.cwd(), cloudRunEnvFile))) {
      dotenvConfig({ path: cloudRunEnvFile });
      console.log(`Loaded environment from ${cloudRunEnvFile}`);
      return;
    }

    // Then try environment-specific file
    if (existsSync(path.resolve(process.cwd(), envFile))) {
      dotenvConfig({ path: envFile });
      console.log(`Loaded environment from ${envFile}`);
      return;
    }

    // Fall back to default .env
    dotenvConfig();
    console.log('Loaded environment from .env');
  } catch (error) {
    console.error('Error loading environment variables:', error);
    // Still try to load default .env as fallback
    dotenvConfig();
  }
}
loadEnvConfig();

// --- Cloud Run Detection (Keep your existing isCloudRun) ---
const isCloudRun = (): boolean => {
  return !!process.env['K_SERVICE'];
};

// --- Zod Schemas ---

const gcpSchema = z
  .object({
    K_SERVICE: z.string().optional(),
    K_REVISION: z.string().optional(),
    K_CONFIGURATION: z.string().optional(),
    GOOGLE_CLOUD_PROJECT: z.string().optional(),
    INSTANCE_CONNECTION_NAME: z.string().optional(),
    STORAGE_BUCKET: z.string().optional(),
    TRACE_ENABLED: z.coerce.boolean().default(false),
  })
  .passthrough();

// NEW: Define Cache specific schema
const cacheSchema = z
  .object({
    CACHE_ENABLED: z.coerce.boolean().default(true), // Global switch for caching
    CACHE_REDIS_ENABLED: z.coerce.boolean().default(false), // Specific switch for Redis store
    // Redis URL - optional if Redis cache is disabled
    CACHE_REDIS_URL: z.string().optional(),
    // Namespace - Use K_SERVICE or app name as default later if not provided
    CACHE_NAMESPACE: z.string().optional(),
    CACHE_MEMORY_TTL_MS: z.coerce
      .number()
      .int()
      .positive()
      .default(60 * 1000), // 60 seconds
    CACHE_MEMORY_LRU_SIZE: z.coerce.number().int().positive().default(5000),
    CACHE_DEFAULT_TTL_MS: z.coerce
      .number()
      .int()
      .positive()
      .default(DEFAULT_CACHE_TTL), // 10 seconds (used by Redis store by default)
    CACHE_REFRESH_THRESHOLD_MS: z.coerce
      .number()
      .int()
      .nonnegative()
      .default(3000), // 3 seconds
    CACHE_NON_BLOCKING: z.coerce.boolean().default(true),
  })
  .passthrough();

// Define core environment variables schema including GCP and Cache
const envSchema = z
  .object({
    // Server
    NODE_ENV: z
      .enum(['development', 'test', 'production'])
      .default('development'),
    PORT: z.coerce.number().default(process.env['K_SERVICE'] ? 8080 : 3000),
    HOST: z.string().default('0.0.0.0'),
    API_PREFIX: z.string().default('/api/v1'),

    // Instance Configuration
    MAX_CONCURRENCY: z.coerce.number().default(80),
    MAX_INSTANCE_REQUEST_CONCURRENCY: z.coerce.number().default(10),

    // Database
    DATABASE_URL: z.string().optional(),
    DB_CONNECTION_TIMEOUT_MS: z.coerce.number().default(10000),
    DB_POOL_MIN: z.coerce.number().default(2),
    DB_POOL_MAX: z.coerce.number().default(10),
    DB_IDLE_TIMEOUT_MS: z.coerce.number().default(60000),

    // Logging
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace'])
      .default('debug'),
    LOG_FORMAT: z
      .enum(['json', 'pretty'])
      .default(process.env['NODE_ENV'] === 'production' ? 'json' : 'pretty'),

    // Security
    CORS_ORIGIN: z.string().default('*'),
    SECURITY_IS_EXTERNAL: z.coerce.boolean().default(false),
    RATE_LIMIT_WINDOW_MS: z.coerce.number().default(15 * 60 * 1000),
    RATE_LIMIT_MAX: z.coerce.number().default(100),

    // Health checks
    HEALTH_CHECK_PATH: z.string().default('/health'),
    READINESS_CHECK_PATH: z.string().default('/readiness'),
    LIVENESS_CHECK_PATH: z.string().default('/liveness'),

    // Timeouts
    REQUEST_TIMEOUT_MS: z.coerce.number().default(30000),
    SHUTDOWN_TIMEOUT_MS: z.coerce.number().default(10000),

    // GCP-specific configurations
    ...gcpSchema.shape,

    // Cache-specific configurations
    ...cacheSchema.shape,
  })
  .passthrough()
  .refine(
    (data) => {
      // Validation: If Redis cache is enabled, REDIS_URL must be provided
      if (
        data.CACHE_ENABLED &&
        data.CACHE_REDIS_ENABLED &&
        !data.CACHE_REDIS_URL
      ) {
        return false;
      }
      return true;
    },
    {
      message:
        'REDIS_URL is required when CACHE_ENABLED and CACHE_REDIS_ENABLED are true.',
      path: ['REDIS_URL'], // Optional: specify the path of the error
    },
  );

// --- AppConfig Interface ---
export interface AppConfig {
  server: {
    applicationName: string;
    port: number;
    host: string;
    apiPrefix: string;
    isDevelopment: boolean;
    environment: string;
    isProduction: boolean;
    isTest: boolean;
    isCloudRun: boolean;
    maxConcurrency: number;
    instanceRequestConcurrency: number;
    requestTimeout: number;
    shutdownTimeout: number;
  };
  database: {
    url: string | undefined | null;
    connectionTimeout: number;
    pool: {
      min: number;
      max: number;
      idleTimeout: number;
    };
  };
  logging: {
    level: string;
    format: string;
    includeTraceId: boolean;
  };
  security: {
    isExternal: boolean;
    corsOrigin: string;
    rateLimit: {
      windowMs: number;
      max: number;
    };
  };
  health: {
    healthCheckPath: string;
    readinessCheckPath: string;
    livenessCheckPath: string;
  };
  gcp?:
    | {
        project: string | undefined | null;
        service: string | undefined | null;
        revision: string | undefined | null;
        configuration: string | undefined | null;
        instanceConnectionName: string | undefined | null;
        storageBucket: string | undefined | null;
        traceEnabled: boolean;
      }
    | undefined
    | null;
  // NEW: Cache Configuration Section
  cache: {
    enabled: boolean;
    redisEnabled: boolean;
    redisUrl: string | undefined;
    namespace: string;
    memoryTtlMs: number;
    memoryLruSize: number;
    defaultTtlMs: number; // Default TTL for cache-manager (often used by Redis)
    refreshThresholdMs: number;
    nonBlocking: boolean;
  };
  app: Record<string, unknown> | undefined | null;
}

// --- getConfig Function ---
export function getConfig(): AppConfig {
  try {
    const envResult = envSchema.safeParse(process.env);

    if (!envResult.success) {
      console.error(
        '❌ Environment validation errors:',
        envResult.error.format(),
      );
      // Log details for easier debugging
      envResult.error.issues.forEach((issue) => {
        console.error(
          `  - Path: ${issue.path.join('.')}, Message: ${issue.message}`,
        );
      });
      throw new Error('Invalid environment configuration');
    }

    const env = envResult.data;
    const cloudRunDetected = isCloudRun();

    // Determine application name and cache namespace
    const applicationName = env.K_SERVICE || 'my-app'; // Default if not on Cloud Run
    const cacheNamespace = env.CACHE_NAMESPACE || applicationName; // Use app name if namespace not explicitly set

    const config: AppConfig = {
      server: {
        applicationName: applicationName,
        port: env.PORT,
        host: env.HOST,
        apiPrefix: env.API_PREFIX,
        environment: env.NODE_ENV,
        isDevelopment: env.NODE_ENV === 'development',
        isProduction: env.NODE_ENV === 'production',
        isTest: env.NODE_ENV === 'test',
        isCloudRun: cloudRunDetected,
        maxConcurrency: env.MAX_CONCURRENCY,
        instanceRequestConcurrency: env.MAX_INSTANCE_REQUEST_CONCURRENCY,
        requestTimeout: env.REQUEST_TIMEOUT_MS,
        shutdownTimeout: env.SHUTDOWN_TIMEOUT_MS,
      },
      database: {
        url: env.DATABASE_URL,
        connectionTimeout: env.DB_CONNECTION_TIMEOUT_MS,
        pool: {
          min: env.DB_POOL_MIN,
          max: env.DB_POOL_MAX,
          idleTimeout: env.DB_IDLE_TIMEOUT_MS,
        },
      },
      logging: {
        level: env.LOG_LEVEL,
        format: env.LOG_FORMAT,
        includeTraceId: env.TRACE_ENABLED,
      },
      security: {
        isExternal: env.SECURITY_IS_EXTERNAL,
        corsOrigin: env.CORS_ORIGIN,
        rateLimit: {
          windowMs: env.RATE_LIMIT_WINDOW_MS,
          max: env.RATE_LIMIT_MAX,
        },
      },
      health: {
        healthCheckPath: env.HEALTH_CHECK_PATH,
        readinessCheckPath: env.READINESS_CHECK_PATH,
        livenessCheckPath: env.LIVENESS_CHECK_PATH,
      },
      gcp: cloudRunDetected
        ? {
            project: env.GOOGLE_CLOUD_PROJECT,
            service: env.K_SERVICE,
            revision: env.K_REVISION,
            configuration: env.K_CONFIGURATION,
            instanceConnectionName: env.INSTANCE_CONNECTION_NAME,
            storageBucket: env.STORAGE_BUCKET,
            traceEnabled: env.TRACE_ENABLED,
          }
        : undefined,
      // NEW: Populate Cache Config
      cache: {
        enabled: env.CACHE_ENABLED,
        redisEnabled: env.CACHE_REDIS_ENABLED,
        redisUrl: env.CACHE_REDIS_URL,
        namespace: cacheNamespace, // Use determined namespace
        memoryTtlMs: env.CACHE_MEMORY_TTL_MS,
        memoryLruSize: env.CACHE_MEMORY_LRU_SIZE,
        defaultTtlMs: env.CACHE_DEFAULT_TTL_MS,
        refreshThresholdMs: env.CACHE_REFRESH_THRESHOLD_MS,
        nonBlocking: env.CACHE_NON_BLOCKING,
      },
      app: {}, // Keep custom section
    };

    // Log cache config status
    console.log(
      `Cache Config: Enabled=${config.cache.enabled}, Redis=${config.cache.redisEnabled}, Namespace='${config.cache.namespace}'`,
    );
    if (
      config.cache.enabled &&
      config.cache.redisEnabled &&
      !config.cache.redisUrl
    ) {
      console.warn(
        '⚠️ Cache Warning: Redis cache is enabled but REDIS_URL is missing in the environment.',
      );
    }

    return config;
  } catch (error) {
    console.error('❌ Error loading configuration:', error);
    // Rethrow or handle critical failure (providing defaults might hide issues)
    throw new Error(
      `Configuration failed to load: ${error instanceof Error ? error.message : String(error)}`,
    );
    // Or return a minimal default config if absolutely necessary for basic startup
    // return createDefaultFallbackConfig(); // (You'd need to define this function)
  }
}

// --- Config Initialization and Access ---
export const config: AppConfig = Object.freeze(getConfig());

// --- Helper for Fallback Config (Optional) ---
/*
function createDefaultFallbackConfig(): AppConfig {
    console.warn("⚠️ Using fallback default configuration due to initialization errors.");
    const defaultAppName = 'fallback-app';
    // Return a minimal, safe configuration
    return {
      // ... fill with minimal safe defaults ...
       cache: {
           enabled: false, // Disable cache in fallback
           redisEnabled: false,
           redisUrl: undefined,
           namespace: defaultAppName,
           memoryTtlMs: 60000,
           memoryLruSize: 100,
           defaultTtlMs: 10000,
           refreshThresholdMs: 3000,
           nonBlocking: true,
       },
       // ... other sections with safe defaults ...
    };
}
*/
