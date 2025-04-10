// src/utils/logger.ts
import { randomBytes } from 'node:crypto';

import pino, {
  type LoggerOptions,
  type Level,
  type TransportTargetOptions,
} from 'pino';
import { pinoHttp } from 'pino-http';

import { config } from '@/config/index.js';

// --- Determine Configuration Synchronously ---
// This approach reads environment variables directly but mirrors the logic
// and defaults from your `config/index.ts` Zod schema. This ensures the logger
// is available immediately on import without top-level await issues.
const isProduction = config.server.isProduction;
const isTest = !config.server.isProduction;

// Get log level from env or default based on environment (matches config schema default)
// Pino typically validates level strings, cast for type safety.
const logLevel = config.logging.level as Level;

// Determine log format (matches config schema default logic)
const logFormat = config.logging.format;

// --- Pino Configuration ---

const pinoOptions: LoggerOptions = {
  level: logLevel,
  // Base object - properties added automatically to every log entry
  base: {
    // pid: undefined, // Remove process ID - less useful in containers (like Cloud Run)
    // Add service name if running on Cloud Run (using standard env var)
    ...(config.gcp?.service ? { service: config.gcp?.service } : {}),
    // You could add other static context here if needed
    application: config.server.applicationName, // Application name
  },
  // Formatters allow customizing log object structure (optional)
  formatters: {
    level: (label) => ({ level: label }), // Standard level formatting key: 'level'
    // bindings: (bindings) => { ... }, // Customize how bindings (like pid, hostname) are formatted
    // log: (obj) => { ... } // Completely customize the final log object
  },
  // Use standard ISO timestamp format
  timestamp: pino.stdTimeFunctions.isoTime,

  // --- Redaction (Important for Security) ---
  // Define paths to sensitive data that should be redacted from logs.
  redact: isProduction
    ? {
        paths: [
          'req.headers.authorization', // Common sensitive header
          'req.headers["x-api-key"]', // Another example
          'req.body.password', // Password in request body
          'req.body.newPassword',
          'req.body.accessToken', // Tokens
          'req.body.refreshToken',
          '*.password', // Redact any field named 'password' at any depth
          '*.secret', // Redact any field named 'secret'
          '*.token', // Redact any field named 'token'
          'user.email', // Example: PII
          'customer.address.street', // Example: More PII
        ],
        censor: '[REDACTED]', // Character(s) used for redaction
        remove: false, // Set to true to remove the key entirely instead of censoring
      }
    : [], // No redaction in non-production environments

  // Disable logger if in test environment unless explicitly enabled via LOG_LEVEL
  enabled: !(isTest && !process.env['LOG_LEVEL']),
};

if (!isProduction) {
  pinoOptions.transport = {
    target: 'pino-pretty',
    options: {
      colorize: true, // Enable colors for readability in terminals
      translateTime: 'SYS:yyyy-mm-dd HH:MM:ss', // Human-readable timestamp format
      ignore: 'pid,hostname', // Hide default pid and hostname when pretty printing
      include: 'level,time,msg,service,module',
      // Example: Customize message format (if needed)
      messageFormat: '[{service}/{module}] {msg}',
    } satisfies TransportTargetOptions['options'], // Use 'satisfies' for type checking options
  };
}

// Create the single, shared logger instance
const logger = pino.pino(pinoOptions);

// Initial log message confirming setup (won't show if disabled in test env)
if (logger.isLevelEnabled('info')) {
  logger.info(
    `Logger initialized (PID:${process.pid}) -> Level: ${logLevel}, Format: ${logFormat}, Production: ${isProduction}, Test: ${isTest}`,
  );
}

/**
 * Extract GCP trace ID from HTTP request headers
 *
 * @param req HTTP request object
 * @returns Object containing trace context if available
 */
export function getTraceContext(req?: {
  headers: Record<string, string | string[]>;
}): Record<string, string> | undefined {
  let traceHeader: string | undefined;

  // First check if we have a request object with headers
  traceHeader =
    process.env['TRACE_HEADER'] ||
    process.env['X_CLOUD_TRACE_CONTEXT'] ||
    (req?.headers['x-cloud-trace-context'] as string);

  if (!traceHeader) {
    logger.info(
      'No request object provided, checking environment variables for trace context',
    );
    return undefined;
  }

  // Parse trace header format: TRACE_ID/SPAN_ID;TRACE_TRUE
  const [traceId, spanPart] = traceHeader.split('/');
  const spanId = spanPart?.split(';')[0];

  if (!traceId || !config.gcp?.project) {
    logger.info('Trace ID or GCP project ID not found, skipping trace context');
    return undefined;
  }

  // Format trace context for Cloud Logging
  const traceContext: Record<string, string> = {
    'logging.googleapis.com/trace': `projects/${config.gcp?.project}/traces/${traceId}`,
  };

  // Add span ID if available
  if (spanId) {
    traceContext['logging.googleapis.com/spanId'] = spanId;
  }

  return traceContext;
}

/**
 * Creates a child logger with additional bound context including trace information if available.
 *
 * @param context An object containing key-value pairs to add to log entries.
 * @returns A new Pino logger instance inheriting parent's config but with added context.
 */
export function createChildLogger(
  context: Record<string, any> = {},
): pino.Logger {
  const traceContext = getTraceContext();

  // Merge provided context with trace information if available
  const mergedContext = {
    ...context,
    ...(traceContext || {}),
  };

  return logger.child(mergedContext);
}

// Configure pino-http middleware with GCP trace support
const httpLogger = pinoHttp({
  logger,

  // Define the auto-logging behavior for HTTP requests
  autoLogging: {
    ignore: (req) => {
      // Skip health check endpoints to reduce noise
      return ['/health', '/readiness', '/liveness'].some((path) =>
        req.url?.includes(path),
      );
    },
  },

  customProps: (req, _res) => ({
    ...(getTraceContext(req as any) || {}),
    service: config.gcp?.project
      ? `${config?.gcp?.project}/${config?.gcp?.service}`
      : 'local',
  }),

  redact: config.server.isProduction ? ['req.headers.authorization'] : [], // Redact sensitive headers

  // Custom request ID generation/extraction
  genReqId: (req) => {
    // Use existing request ID if available, or generate a new one
    return (
      req.id || req.headers['x-request-id'] || randomBytes(16).toString('hex')
    );
  },

  // Default serializers (can be customized further)
  serializers: {
    req: pino.stdSerializers.req,
    res: pino.stdSerializers.res,
    err: pino.stdSerializers.err,
  },

  // Configuration for specific log levels
  customLogLevel: (req, res, err) => {
    if (res.statusCode >= 400 && res.statusCode < 500) {
      return 'warn';
    } else if (res.statusCode >= 500 || err) {
      return 'error';
    } else if (res.statusCode >= 300 && res.statusCode < 400) {
      return 'silent'; // Optional: skip 3xx logs to reduce noise
    }
    return 'info';
  },
});

// Export everything
export { logger, httpLogger };
