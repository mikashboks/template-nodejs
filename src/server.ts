import http from 'http';

import { setupApp, prisma } from '@/app.js';
import { config } from '@/config/index.js';
import { logger } from '@/libs/logger.js';
import { setupGracefulShutdown } from '@/middlewares/graceful-shutdown.middleware.js';

/**
 * Main server startup function
 * Initializes the application and starts the HTTP server
 */
async function startServer() {
  try {
    // Set up app with all middleware and routes
    const app = await setupApp();

    // Create HTTP server
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    const server = http.createServer(app);

    // Configure graceful shutdown - important for Cloud Run
    setupGracefulShutdown(server, prisma);

    // Start server
    server.listen(config.server.port, config.server.host, () => {
      const { port, host } = config.server;

      console.info(
        {
          service: config.gcp?.service,
          revision: config.gcp?.revision,
          environment: config.server.environment,
          port,
          host,
          nodeVersion: process.version,
          memory: process.memoryUsage().rss / 1024 / 1024,
        },
        `Server started on http://${host}:${port}`,
      );

      console.info(
        `Health check: http://${host}:${port}${config.health.healthCheckPath}`,
      );
      console.info(
        `API endpoint: http://${host}:${port}${config.server.apiPrefix}`,
      );

      if (config.server.isCloudRun) {
        console.info(`Running on Cloud Run service: ${config.gcp?.service}`);
      } else {
        console.info('Running in local mode');
      }
    });

    // Handle server errors
    server.on('error', (error) => {
      logger.error({ error }, 'Server error');
      process.exit(1);
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      logger.error({ reason, promise }, 'Unhandled Rejection');
    });

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      logger.error({ error }, 'Uncaught Exception');
      // Attempt graceful shutdown, but exit if it takes too long
      setTimeout(() => {
        process.exit(1);
      }, 3000);
    });
  } catch (error) {
    logger.error({ error }, 'Failed to start server');
    process.exit(1);
  }
}

// Start the server
await startServer();
