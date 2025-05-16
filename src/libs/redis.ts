import { createClient, RedisClientType } from 'redis';

import { logger } from './logger.js';
import { config } from '../config/index.js';

let redisClient: RedisClientType | undefined = undefined;
let redisConnectPromise: Promise<RedisClientType> | undefined = undefined;

if (config.cache.redisEnabled && config.cache.redisUrl) {
  redisClient = createClient({ url: config.cache.redisUrl });

  redisClient.on('connect', () => {
    logger.info('Redis client connected');
  });
  redisClient.on('ready', () => {
    logger.info('Redis client ready');
  });
  redisClient.on('end', () => {
    logger.warn('Redis client connection closed');
  });
  redisClient.on('error', (err) => {
    logger.error('Redis client error:', err);
  });

  // Initiate connection
  redisConnectPromise = redisClient.connect();
} else {
  logger.info(
    'Redis client not enabled or no URL provided. Skipping Redis connection.',
  );
}

export { redisClient, redisConnectPromise };
