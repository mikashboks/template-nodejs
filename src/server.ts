// src/server.ts
import http from 'http';
import { app, setupApp, prisma } from './app.js';
import { getConfig } from './config/index.js';
import { logger } from './libs/logger.js';
import { setupGracefulShutdown } from './middlewares/graceful-shutdown.middleware.js';

/**
 * Main server startup function
 * Initializes the application and starts the HTTP server
 */
async function startServer() {
  try {
    // Initialize configuration
    const appConfig = await getConfig();
    
    // Set up app with all middleware and routes
    await setupApp();
    
    // Create HTTP server
    const server = http.createServer(app);
    
    // Configure graceful shutdown - important for Cloud Run
    setupGracefulShutdown(server, prisma);
    
    // Start server
    server.listen(appConfig.server.port, appConfig.server.host, () => {
      const { port, host } = appConfig.server;
      
      logger.info({
        service: appConfig.gcp?.service,
        revision: appConfig.gcp?.revision,
        environment: appConfig.server.environment,
        port,
        host,
        nodeVersion: process.version,
        memory: process.memoryUsage().rss / 1024 / 1024,
      }, `Server started on http://${host}:${port}`);
      
      logger.info(`Health check: http://${host}:${port}${appConfig.health.healthCheckPath}`);
      logger.info(`API endpoint: http://${host}:${port}${appConfig.server.apiPrefix}`);
      
      if (appConfig.server.isCloudRun) {
        logger.info(`Running on Cloud Run service: ${appConfig.gcp?.service}`);
      } else {
        logger.info('Running in local mode');
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
startServer();