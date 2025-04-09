// src/app.ts
import express, {
  type Express,
  type Request,
  type Response,
  type NextFunction,
} from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import { rateLimit } from 'express-rate-limit';
import { pinoHttp } from 'pino-http';
import { PrismaClient } from '@prisma/client';

// Import middleware
import { errorHandlerMiddleware } from './middlewares/error-handler.middleware.js';
import { timeoutMiddleware } from './middlewares/timeout.middleware.js';

// Import config and logger
import { getConfig } from './config/index.js';
import { logger, httpLogger } from './libs/logger.js';
import { tracingMiddleware } from './middlewares/tracing.middleware.ts';

// Create shared Prisma client (singleton pattern for Cloud Run)
export const prisma = new PrismaClient({
  // Log based on environment in config
  log:
    process.env['NODE_ENV'] === 'development'
      ? ['query', 'info', 'warn', 'error']
      : ['error'],
});

// Create Express app
const app: Express = express();

/**
 * Configures the Express application with middleware optimized for Cloud Run
 */
export async function setupApp(): Promise<Express> {
  // Ensure config is initialized
  const appConfig = await getConfig();

  app.use(httpLogger); // HTTP logger for all requests

  // Request ID middleware (for tracing)
  app.use(tracingMiddleware);

  // Request timeout middleware
  app.use(timeoutMiddleware());

  if (appConfig.security.isExternal) {
    // Basic security headers with Helmet
    app.use(
      helmet({
        contentSecurityPolicy: appConfig.server.isProduction ? true : false, // Enable CSP in production
        crossOriginEmbedderPolicy: false, // Allow embedding
      }),
    );

    // CORS configuration
    app.use(
      cors({
        origin: appConfig.security.corsOrigin,
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
        allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
        maxAge: 86400, // 24 hours
      }),
    );

    // Compression middleware (reduce bandwidth)
    app.use(compression());

    // Request body parsing
    app.use(express.json({ limit: '1mb' }));
    app.use(express.urlencoded({ extended: true, limit: '1mb' }));

    // Global rate limiter
    app.use(
      rateLimit({
        windowMs: appConfig.security.rateLimit.windowMs,
        max: appConfig.security.rateLimit.max,
        standardHeaders: true,
        legacyHeaders: false,
        skip: (req) => appConfig.server.isDevelopment,
        message: { error: 'Too many requests', message: 'Rate limit exceeded' },
      }),
    );
  }

  // Set up response timing metrics
  app.use((req, res, next) => {
    // Record response metrics
    const startTime = Date.now();

    // Log when response finishes
    res.on('finish', () => {
      const duration = Date.now() - startTime;
      const level =
        res.statusCode >= 500
          ? 'error'
          : res.statusCode >= 400
            ? 'warn'
            : 'info';

      logger[level](
        {
          req,
          res: {
            statusCode: res.statusCode,
            duration,
          },
        },
        `Request completed: ${req.method} ${req.url} ${res.statusCode} (${duration}ms)`,
      );
    });

    next();
  });

  // Import routes dynamically to avoid circular dependencies
  const { default: healthRoutes } = await import('./routes/health.routes.js');
  const { default: apiRoutes } = await import('./routes/index.js');

  // Health check routes - Cloud Run requires these
  app.use('/', healthRoutes);

  // API routes
  app.use(appConfig.server.apiPrefix, apiRoutes);

  // 404 handler - must come after all routes
  app.use((req: Request, res: Response) => {
    logger.info({ req }, `Route not found: ${req.method} ${req.url}`);
    res.status(404).json({
      success: false,
      message: 'Endpoint not found',
      path: req.path,
    });
  });

  // Error handler middleware - must be last
  app.use(errorHandlerMiddleware);

  return app;
}

export { app };
