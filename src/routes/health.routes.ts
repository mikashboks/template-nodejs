// src/routes/health.routes.ts
import { Router } from 'express';
import os from 'os';
import { prisma } from '../app.js';
import { config } from '../config/index.js';
import { asyncHandler } from '../middleware/async-handler.middleware.js';
import { logger } from '../libs/logger.js';
import { type Request, type Response } from 'express';

const router = Router();

/**
 * Comprehensive health check endpoint for Cloud Run
 * Includes database connectivity and system information
 */
router.get(config().health.healthCheckPath, asyncHandler(async (req: Request, res: Response) => {
  const startTime = Date.now();
  const status = { status: 'ok', checks: {} as Record<string, any> };
  let isHealthy = true;

  // Check database connection
  try {
    await prisma.$queryRaw`SELECT 1`;
    status.checks['database'] = { 
      status: 'ok', 
      responseTime: `${Date.now() - startTime}ms` 
    };
  } catch (error) {
    isHealthy = false;
    status.checks['database'] = { 
      status: 'error', 
      message: 'Database connection failed',
      responseTime: `${Date.now() - startTime}ms` 
    };
    logger.error({ error }, 'Health check database error');
  }

  // System information - useful for monitoring
  // System information - useful for monitoring
    status.checks['system'] = {
    uptime: process.uptime(),
    memory: {
      total: Math.round(os.totalmem() / 1024 / 1024),
      free: Math.round(os.freemem() / 1024 / 1024),
      usage: Math.round((process.memoryUsage().rss / 1024 / 1024) * 100) / 100,
    },
    cpu: os.loadavg(),
  };

  // Environment information
  // Environment information
    status.checks['env'] = {
    node: process.version,
    environment: process.env['NODE_ENV'] || 'development',
    service: config().gcp?.service,
    revision: config().gcp?.revision,
  };

  // Update overall status
  if (!isHealthy) {
    status.status = 'error';
    res.status(500);
  }

  res.json(status);
}));

/**
 * Liveness probe for Cloud Run
 * Fast endpoint that indicates if the service is running
 */
router.get(config().health.livenessCheckPath, (req, res) => {
  res.status(200).json({ 
    status: 'ok',
    timestamp: new Date().toISOString() 
  });
});

/**
 * Readiness probe for Cloud Run
 * Verifies if the service is ready to handle requests
 */
router.get(config().health.readinessCheckPath, asyncHandler(async (req: Request, res: Response) => {
  try {
    // Check if database is available
    await prisma.$queryRaw`SELECT 1`;
    
    res.status(200).json({ 
      status: 'ok',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error({ error }, 'Readiness check failed');
    res.status(503).json({ 
      status: 'error',
      message: 'Service unavailable'
    });
  }
}));

export default router;