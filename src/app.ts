// src/app.ts
import { PrismaClient } from '@prisma/client';
import compression from 'compression';
import cors from 'cors';
import express, { type Express, type Request, type Response } from 'express';
import { rateLimit } from 'express-rate-limit';
import helmet from 'helmet';
import swaggerUi from 'swagger-ui-express';

import { config } from './config/index.js';
import { logger, httpLogger } from './libs/logger.js';
import { errorHandlerMiddleware } from './middlewares/error-handler.middleware.js';
import { timeoutMiddleware } from './middlewares/timeout.middleware.js';
import { tracingMiddleware } from './middlewares/tracing.middleware.js';
import swaggerSpec from './routes/swagger.ts';

// Create shared Prisma client (singleton pattern for Cloud Run)
export const prisma = config.database.url
  ? new PrismaClient({
      // Log based on environment in config
      log:
        process.env['NODE_ENV'] === 'development'
          ? ['query', 'info', 'warn', 'error']
          : ['error'],
    })
  : null;

// Create Express app
const app: Express = express();

/**
 * Configures the Express application with middleware optimized for Cloud Run
 */
export async function setupApp(): Promise<Express> {
  app.use(httpLogger); // HTTP logger for all requests

  // Request ID middleware (for tracing)
  app.use(tracingMiddleware);

  // Request timeout middleware
  app.use(timeoutMiddleware());

  if (config.security.isExternal) {
    // Basic security headers with Helmet
    app.use(
      helmet({
        contentSecurityPolicy: config.server.isProduction ? true : false, // Enable CSP in production
        crossOriginEmbedderPolicy: false, // Allow embedding
      }),
    );

    // CORS configuration
    app.use(
      cors({
        origin: config.security.corsOrigin,
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
        windowMs: config.security.rateLimit.windowMs,
        max: config.security.rateLimit.max,
        standardHeaders: true,
        legacyHeaders: false,
        skip: (_req) => config.server.isDevelopment,
        message: { error: 'Too many requests', message: 'Rate limit exceeded' },
      }),
    );
  }

  app.use(
    '/api-docs',
    swaggerUi.serve,
    swaggerUi.setup(swaggerSpec, {
      explorer: true,
      customCssUrl:
        'https://cdn.jsdelivr.net/npm/swagger-ui-themes@3.0.1/themes/3.x/theme-material.css',
    }),
  );

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
  app.use(config.server.apiPrefix, apiRoutes);

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
