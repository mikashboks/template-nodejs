// src/middleware/graceful-shutdown.middleware.ts
import { Server } from 'http';

import { PrismaClient } from '@prisma/client';

import { config } from '../config/index.js';
import { logger } from '../libs/logger.js';

/**
 * Sets up graceful shutdown handling for Cloud Run instances
 * This is critical to prevent connection leaks when instances are terminated
 *
 * @param server - The HTTP server instance
 * @param prisma - The Prisma client for database connections
 */
export function setupGracefulShutdown(
  server: Server,
  prisma: PrismaClient,
): void {
  let isShuttingDown = false;
  const shutdownTimeout = config.server.shutdownTimeout || 10000; // Default 10 seconds

  // Function to perform graceful shutdown
  async function gracefulShutdown(signal: string) {
    if (isShuttingDown) return;
    isShuttingDown = true;

    logger.info(`Received ${signal}. Starting graceful shutdown...`);

    // Set a timeout to force exit if graceful shutdown takes too long
    const forceExitTimeout = setTimeout(() => {
      logger.error('Graceful shutdown timed out. Forcing exit.');
      process.exit(1);
    }, shutdownTimeout);

    try {
      // Stop accepting new connections
      server.close(() => {
        logger.info('HTTP server closed.');
      });

      // Log active connections if possible
      const activeConnections = server.getConnections
        ? await new Promise((resolve) =>
            server.getConnections((err, count) => resolve(err ? 0 : count)),
          )
        : 'unknown';

      logger.info(`Waiting for ${activeConnections} connection(s) to close...`);

      // Close database connections
      logger.info('Closing database connections...');
      await prisma.$disconnect();
      logger.info('Database connections closed.');

      // Clear the force exit timeout
      clearTimeout(forceExitTimeout);

      logger.info('Graceful shutdown completed.');
      process.exit(0);
    } catch (err) {
      logger.error({ err }, 'Error during graceful shutdown');
      clearTimeout(forceExitTimeout);
      process.exit(1);
    }
  }

  // Listen for termination signals
  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  process.on('SIGTERM', async () => {
    await gracefulShutdown('SIGTERM');
  });
  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  process.on('SIGINT', async () => {
    await gracefulShutdown('SIGINT');
  });

  logger.info('Graceful shutdown handlers registered');
}
