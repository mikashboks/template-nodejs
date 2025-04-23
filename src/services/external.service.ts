import { Logger } from 'pino';

import { ExternalServiceError, RetryableError } from '@/errors/base.js';

import {
  AbstractService,
  TraceContext,
  ServiceOptions,
  ServiceInitOptions,
} from './abstract.service.js';

/**
 * Options for configuring the circuit breaker pattern.
 */
export interface CircuitBreakerOptions {
  /** Whether the circuit breaker is enabled. Default: false */
  enabled?: boolean;
  /** Number of consecutive failures required to open the circuit. Default: 5 */
  failureThreshold?: number;
  /** Duration in milliseconds the circuit stays open before transitioning to half-open. Default: 30000 */
  resetTimeoutMs?: number;
  /** Number of requests allowed in the half-open state to test recovery. Default: 1 */
  halfOpenRequestThreshold?: number;
}

/**
 * Options for configuring retry behavior on failed requests.
 */
export interface RetryOptions {
  /** Maximum number of retry attempts. Default: 3 */
  retries?: number;
  /** Exponential backoff factor. Default: 2 */
  factor?: number;
  /** Minimum delay in milliseconds between retries. Default: 1000 */
  minTimeout?: number;
  /** Maximum delay in milliseconds between retries. Default: 10000 */
  maxTimeout?: number;
  /** Whether to add random jitter to the delay. Default: true */
  randomize?: boolean;
}

/**
 * Base class for services that interact with external APIs, providing
 * built-in support for timeouts, retries (with exponential backoff),
 * and the circuit breaker pattern.
 */
export abstract class ExternalService extends AbstractService {
  protected readonly baseUrl: string;
  protected readonly defaultTimeout: number;
  protected readonly retryOptions: Required<RetryOptions>; // Use Required for guaranteed properties
  protected readonly circuitBreakerOptions: Required<CircuitBreakerOptions>;

  private circuitState: 'closed' | 'open' | 'half-open' = 'closed';
  private failureCount: number = 0;
  private lastFailureTime: number = 0;
  private halfOpenRequests: number = 0;

  constructor(
    serviceName: string,
    baseUrl: string,
    defaultTimeout: number = 10000,
    logger?: Logger,
    retryOptions?: RetryOptions,
    circuitBreakerOptions?: CircuitBreakerOptions,
  ) {
    super(serviceName, logger);
    this.baseUrl = baseUrl;
    this.defaultTimeout = defaultTimeout;

    // Initialize retry options with defaults
    this.retryOptions = {
      retries: retryOptions?.retries ?? 3,
      factor: retryOptions?.factor ?? 2,
      minTimeout: retryOptions?.minTimeout ?? 1000,
      maxTimeout: retryOptions?.maxTimeout ?? 10000,
      randomize: retryOptions?.randomize ?? true,
    };

    // Initialize circuit breaker options with defaults
    this.circuitBreakerOptions = {
      enabled: circuitBreakerOptions?.enabled ?? false,
      failureThreshold: circuitBreakerOptions?.failureThreshold ?? 5,
      resetTimeoutMs: circuitBreakerOptions?.resetTimeoutMs ?? 30000,
      halfOpenRequestThreshold:
        circuitBreakerOptions?.halfOpenRequestThreshold ?? 1,
    };

    this.logger.info(
      {
        service: this.serviceName,
        baseUrl: this.baseUrl,
        defaultTimeout: this.defaultTimeout,
        retryEnabled: this.retryOptions.retries > 0,
        circuitBreakerEnabled: this.circuitBreakerOptions.enabled,
      },
      `${this.serviceName} external service client initialized`,
    );
  }

  /**
   * Checks the current state of the circuit breaker and throws an error if the circuit is open.
   * Allows transitioning from 'open' to 'half-open' if the reset timeout has passed.
   * Limits requests in the 'half-open' state.
   *
   * @throws Error if the circuit is 'open' or 'half-open' and the request limit is reached.
   */
  private checkCircuitBreaker(): void {
    if (!this.circuitBreakerOptions.enabled) {
      return; // Skip if disabled
    }

    const now = Date.now();

    if (this.circuitState === 'open') {
      if (
        now - this.lastFailureTime >
        this.circuitBreakerOptions.resetTimeoutMs
      ) {
        this.circuitState = 'half-open';
        this.halfOpenRequests = 0; // Reset counter for the new half-open phase
        this.logger.info(
          `Circuit breaker state changed to 'half-open' for ${this.serviceName}`,
        );
      } else {
        this.logger.warn(
          `Circuit breaker is 'open' for ${this.serviceName}. Request blocked.`,
        );
        throw new Error(`Circuit breaker for ${this.serviceName} is open`);
      }
    }

    if (this.circuitState === 'half-open') {
      if (
        this.halfOpenRequests >=
        this.circuitBreakerOptions.halfOpenRequestThreshold
      ) {
        this.logger.warn(
          `Circuit breaker is 'half-open' for ${this.serviceName} and request limit reached. Request blocked.`,
        );
        throw new Error(
          `Circuit breaker for ${this.serviceName} is half-open and request limit reached`,
        );
      }
      // Increment only if check passes and request proceeds
      // This is implicitly handled by the calling `request` method now
    }
  }

  /**
   * Registers a successful request outcome with the circuit breaker.
   * Resets failure count and potentially transitions from 'half-open' back to 'closed'.
   */
  private registerSuccess(): void {
    if (!this.circuitBreakerOptions.enabled) {
      return; // Skip if disabled
    }

    if (this.circuitState === 'half-open') {
      this.circuitState = 'closed';
      this.failureCount = 0;
      this.halfOpenRequests = 0; // Reset counter
      this.logger.info(
        `Circuit breaker state changed back to 'closed' for ${this.serviceName} after successful half-open request`,
      );
    } else if (this.circuitState === 'closed') {
      // Reset failure count on any success in closed state
      if (this.failureCount > 0) {
        this.logger.debug(
          `Resetting failure count for ${this.serviceName} after successful request.`,
        );
        this.failureCount = 0;
      }
    }
    // No change needed if already 'open' (success shouldn't happen if open)
  }

  /**
   * Registers a failed request outcome with the circuit breaker.
   * Increments failure count and potentially transitions state to 'open'.
   */
  private registerFailure(): void {
    if (!this.circuitBreakerOptions.enabled) {
      return; // Skip if disabled
    }

    const now = Date.now();
    this.lastFailureTime = now;

    if (this.circuitState === 'half-open') {
      // Any failure in half-open state trips the circuit back to open
      this.circuitState = 'open';
      this.logger.warn(
        `Circuit breaker state changed back to 'open' for ${this.serviceName} after failed half-open request`,
      );
    } else if (this.circuitState === 'closed') {
      this.failureCount++;
      this.logger.debug(
        `Failure count for ${this.serviceName} incremented to ${this.failureCount}`,
      );
      if (this.failureCount >= this.circuitBreakerOptions.failureThreshold) {
        this.circuitState = 'open';
        this.logger.warn(
          `Circuit breaker state changed to 'open' for ${this.serviceName} after ${this.failureCount} consecutive failures`,
        );
      }
    }
    // No change needed if already 'open'
  }

  /**
   * Abstract method to be implemented by subclasses for handling authentication.
   * This method should modify the provided headers object to add authentication details
   * (e.g., Authorization tokens). It's called once before the request attempts begin.
   *
   * @param headers The headers object for the outgoing request.
   * @throws Error if authentication fails.
   */
  protected abstract authenticate(
    headers: Record<string, string>,
  ): Promise<void>;

  /**
   * Makes a request to the external API with configured timeout, retry, and circuit breaker logic.
   *
   * @template T The expected response type.
   * @param method The HTTP method (e.g., 'GET', 'POST').
   * @param path The API path relative to the baseUrl.
   * @param options Optional configuration for the request.
   * @returns A promise resolving to the parsed JSON response.
   * @throws {ExternalServiceError} If the request fails after all retries or with a non-retryable error.
   * @throws {Error} If the circuit breaker is open or authentication fails.
   */
  protected async request<T>(
    method: string,
    path: string,
    options?: {
      data?: any;
      params?: Record<string, string>;
      headers?: Record<string, string>;
      timeout?: number;
      signal?: AbortSignal | null;
      traceContext?: TraceContext;
    },
  ): Promise<T> {
    // 1. Initialize context and URL
    const contextLogger = options?.traceContext
      ? this.logger.child(options.traceContext)
      : this.logger;
    const url = new URL(path, this.baseUrl);
    if (options?.params) {
      Object.entries(options.params).forEach(([key, value]) => {
        url.searchParams.append(key, value);
      });
    }

    // 2. Prepare Headers (including trace context)
    const headers: Record<string, string> = {
      'Content-Type': 'application/json', // Default, can be overridden
      ...options?.headers,
    };
    if (options?.traceContext?.['X-Cloud-Trace-Context']) {
      // Prefer canonical header if present
      headers['x-cloud-trace-context'] =
        options.traceContext['X-Cloud-Trace-Context'];
    } else if (options?.traceContext?.['x-cloud-trace-context']) {
      // Allow lowercase alternative
      headers['x-cloud-trace-context'] =
        options.traceContext['x-cloud-trace-context'];
    }

    // 3. Check Circuit Breaker before attempting anything
    // Note: This throws if the circuit is open/half-open limit reached
    this.checkCircuitBreaker();

    // Increment half-open request counter *if* in that state and check passed
    if (
      this.circuitBreakerOptions.enabled &&
      this.circuitState === 'half-open'
    ) {
      this.halfOpenRequests++;
      contextLogger.debug(
        `Attempting request in half-open state (${this.halfOpenRequests}/${this.circuitBreakerOptions.halfOpenRequestThreshold})`,
      );
    }

    // 4. Perform Authentication (once before retries)
    try {
      await this.authenticate(headers); // Modifies headers object directly
    } catch (authError: unknown) {
      contextLogger.error(
        { error: authError instanceof Error ? authError.message : authError },
        'Authentication failed before making request',
      );
      // Authentication failure is critical, don't register with circuit breaker, just fail fast.
      throw authError instanceof Error
        ? authError
        : new Error('Authentication failed');
    }

    // 5. Execute Request with Retries
    let attempt = 0;
    let lastError: Error | undefined;
    const startTime = Date.now();

    while (attempt <= this.retryOptions.retries) {
      attempt++;
      const controller = new AbortController();
      const timeout = options?.timeout ?? this.defaultTimeout;
      const timeoutId = setTimeout(() => {
        controller.abort(new Error(`Request timed out after ${timeout}ms`)); // Pass reason
      }, timeout);

      // Combine external signal if provided
      const externalSignal = options?.signal;
      const onExternalAbort = () =>
        controller.abort(new Error('Request aborted by external signal'));
      externalSignal?.addEventListener('abort', onExternalAbort);

      try {
        const fetchOptions: RequestInit = {
          method,
          headers,
          signal: controller.signal, // Use combined signal
          body:
            method !== 'GET' && method !== 'HEAD' && options?.data !== undefined
              ? JSON.stringify(options.data)
              : null, // More strict body check
        };

        const response = await fetch(url.toString(), fetchOptions);
        clearTimeout(timeoutId); // Clear timeout timer
        externalSignal?.removeEventListener('abort', onExternalAbort); // Clean up listener

        const duration = Date.now() - startTime;
        contextLogger.debug(
          {
            method,
            url: url.href,
            status: response.status,
            duration,
            attempt,
            circuitState: this.circuitBreakerOptions.enabled
              ? this.circuitState
              : 'disabled',
          },
          'External request attempt finished',
        );

        // Success Case
        if (response.ok) {
          this.registerSuccess(); // Inform circuit breaker of success
          try {
            // Handle potential empty body for 204 No Content etc.
            if (
              response.status === 204 ||
              response.headers.get('content-length') === '0'
            ) {
              return undefined as T; // Or handle as needed, maybe {} as T
            }
            const data = (await response.json()) as T;
            return data;
          } catch (parseError: unknown) {
            contextLogger.error(
              {
                error:
                  parseError instanceof Error ? parseError.message : parseError,
              },
              'Failed to parse JSON response',
            );
            // Treat JSON parsing error as a failure, but likely not retryable server-side
            lastError = new ExternalServiceError(
              'Failed to parse JSON response',
              { cause: parseError },
            );
            // Don't retry parsing errors usually
            break; // Exit retry loop
          }
        }

        // Handle HTTP Error Statuses
        const errorText = await response.text();
        lastError = this.isRetryable(response.status)
          ? new RetryableError(
              errorText || `Request failed with status ${response.status}`,
              response.status,
            )
          : new ExternalServiceError(
              errorText || `Request failed with status ${response.status}`,
              { statusCode: response.status },
            );

        contextLogger.warn(
          {
            status: response.status,
            attempt,
            error: errorText.substring(0, 100), // Log snippet of error
          },
          `Request attempt failed with status ${response.status}`,
        );

        // If not retryable or last attempt, break the loop to throw error
        if (
          !(lastError instanceof RetryableError) ||
          attempt > this.retryOptions.retries
        ) {
          break;
        }

        // If retryable and more attempts left, proceed to delay/retry logic below
      } catch (error: unknown) {
        clearTimeout(timeoutId); // Clear timeout timer on any error
        externalSignal?.removeEventListener('abort', onExternalAbort); // Clean up listener

        // Handle fetch errors (network, CORS, AbortError etc.)
        if (error instanceof Error) {
          lastError = error; // Store the error
          contextLogger.warn(
            { attempt, error: error.message, type: error.name },
            `Request attempt failed with error`,
          );
          // AbortError due to timeout or external signal is often retryable
          if (
            error.name === 'AbortError' &&
            attempt <= this.retryOptions.retries
          ) {
            // Proceed to delay/retry logic below
          } else if (
            error instanceof RetryableError &&
            attempt <= this.retryOptions.retries
          ) {
            // Already marked as retryable, proceed to delay/retry logic below
          } else {
            // Non-retryable fetch error (e.g., DNS resolution) or AbortError on last attempt
            break; // Exit retry loop
          }
        } else {
          // Should not happen often, but handle non-Error throws
          lastError = new ExternalServiceError(
            `An unknown error occurred: ${error}`,
          );
          contextLogger.error(
            { attempt, error },
            `Request attempt failed with unknown error type`,
          );
          break; // Exit retry loop
        }
      }

      // --- Retry Logic (if loop continues) ---
      this.registerFailure(); // Register failure *before* retrying

      const delay = this.calculateRetryDelay(attempt);
      contextLogger.info(
        { attempt, maxRetries: this.retryOptions.retries, delay },
        `Scheduling retry after delay`,
      );
      await new Promise((resolve) => setTimeout(resolve, delay));

      // Before next attempt, re-check circuit breaker in case it tripped during wait
      try {
        this.checkCircuitBreaker();
      } catch (cbError) {
        contextLogger.warn(
          'Circuit breaker tripped during retry delay. Aborting retries.',
        );
        lastError =
          cbError instanceof Error ? cbError : new Error(String(cbError));
        break; // Exit retry loop
      }
    } // End while loop

    // 6. Handle Final Outcome
    const finalDuration = Date.now() - startTime;
    if (lastError) {
      // If we exited the loop with an error (retries exhausted or non-retryable)
      this.registerFailure(); // Ensure failure is registered one last time
      contextLogger.error(
        {
          method,
          url: url.href,
          error: lastError.message,
          type: lastError.name,
          status:
            (lastError as any).statusCode ??
            (lastError as any).status ??
            undefined, // Get status if available
          attemptsMade: attempt,
          totalDuration: finalDuration,
          circuitState: this.circuitBreakerOptions.enabled
            ? this.circuitState
            : 'disabled',
        },
        'External request failed after all attempts or due to non-retryable error',
      );
      // Throw the specific error type captured
      throw lastError;
    } else {
      // Should only happen if request succeeded on first try and logic is somehow bypassed - safeguard
      const unexpectedError = new ExternalServiceError(
        'Request loop completed without success or error capture.',
      );
      contextLogger.error(
        'Unexpected state: request loop finished without result or error.',
      );
      throw unexpectedError;
    }
  }

  /**
   * Determines if an HTTP status code indicates a potentially temporary issue
   * that might be resolved by retrying the request.
   *
   * @param statusCode The HTTP status code.
   * @returns True if the status code suggests a retry might succeed, false otherwise.
   */
  protected isRetryable(statusCode: number): boolean {
    // 429 Too Many Requests, 5xx Server Errors
    return statusCode === 429 || (statusCode >= 500 && statusCode <= 599);
  }

  /**
   * Calculates the delay for the next retry attempt using exponential backoff
   * with optional randomization (jitter).
   *
   * @param attempt The current attempt number (starting from 1).
   * @returns The calculated delay in milliseconds.
   */
  protected calculateRetryDelay(attempt: number): number {
    const { factor, minTimeout, maxTimeout, randomize } = this.retryOptions;
    // Exponential backoff: minTimeout * (factor ^ (attempt - 1))
    let delay = minTimeout * Math.pow(factor, attempt - 1);
    if (randomize) {
      // Apply jitter: delay * (random value between 0.5 and 1.5)
      // Simple jitter: delay +/- 50%
      delay = delay * (0.5 + Math.random());
    }
    // Clamp delay between minTimeout and maxTimeout
    return Math.max(minTimeout, Math.min(delay, maxTimeout));
  }

  /**
   * Provides a context for operations, but transactions are not typically
   * supported for external HTTP services in the same way as databases.
   * This method simply executes the callback.
   */
  public async withTransaction<T>(
    callback: (service: this) => Promise<T>,
    options?: ServiceOptions, // Keep options for potential future use or consistency
  ): Promise<T> {
    this.logger.debug(
      'Executing operation without transaction support (external service). Context: %j',
      options?.traceContext,
    );
    // Simply execute the callback, passing the current service instance
    return callback(this);
  }

  // --- Convenience HTTP Method Wrappers ---

  protected async get<T>(
    path: string,
    options?: Omit<Parameters<typeof this.request>[2], 'data' | 'method'>,
  ): Promise<T> {
    return this.request<T>('GET', path, options);
  }

  protected async post<D = any, T = any>(
    path: string,
    data?: D,
    options?: Omit<Parameters<typeof this.request>[2], 'data' | 'method'>,
  ): Promise<T> {
    return this.request<T>('POST', path, { ...options, data });
  }

  protected async put<D = any, T = any>(
    path: string,
    data?: D,
    options?: Omit<Parameters<typeof this.request>[2], 'data' | 'method'>,
  ): Promise<T> {
    return this.request<T>('PUT', path, { ...options, data });
  }

  protected async patch<D = any, T = any>(
    path: string,
    data?: D,
    options?: Omit<Parameters<typeof this.request>[2], 'data' | 'method'>,
  ): Promise<T> {
    return this.request<T>('PATCH', path, { ...options, data });
  }

  protected async delete<T = any>(
    path: string,
    options?: Omit<Parameters<typeof this.request>[2], 'data' | 'method'>,
  ): Promise<T> {
    return this.request<T>('DELETE', path, options);
  }

  /**
   * Performs a basic health check by making a GET request to the specified path.
   *
   * @param path The path to use for the health check (relative to baseUrl). Default: '/health'.
   * @param timeout Timeout for the health check request in milliseconds. Default: 5000.
   * @returns True if the request succeeds (status 2xx), false otherwise.
   */
  public async healthCheck(
    path: string = '/health',
    timeout: number = 5000,
  ): Promise<boolean> {
    this.logger.debug(
      `Performing health check on ${this.serviceName} at path '${path}'`,
    );
    try {
      // Use GET for health check, bypass retries and circuit breaker for a quick check
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);
      const headers: Record<string, string> = {};
      // Add minimal auth if needed, assuming health checks might require it
      try {
        await this.authenticate(headers);
      } catch (authError) {
        this.logger.warn(
          { error: authError instanceof Error ? authError.message : authError },
          `Authentication failed during health check for ${this.serviceName}`,
        );
        // Decide if auth failure means unhealthy, likely yes
        return false;
      }

      const response = await fetch(new URL(path, this.baseUrl).toString(), {
        method: 'GET',
        signal: controller.signal,
        headers: headers, // Pass potentially modified headers
      });
      clearTimeout(timeoutId);
      this.logger.debug(
        `Health check for ${this.serviceName} completed with status ${response.status}`,
      );
      return response.ok; // ok is true for status 200-299
    } catch (error: unknown) {
      this.logger.warn(
        `Health check failed for ${this.serviceName} at path '${path}': ${error instanceof Error ? error.message : String(error)}`,
      );
      return false;
    }
  }

  /**
   * Gets the current state and basic metrics of the circuit breaker.
   *
   * @returns An object containing the circuit breaker's status.
   */
  public getCircuitBreakerStats(): {
    enabled: boolean;
    state: 'closed' | 'open' | 'half-open';
    failureCount: number;
    lastFailureTime: number | null; // Timestamp or null
  } {
    return {
      enabled: this.circuitBreakerOptions.enabled,
      state: this.circuitState,
      failureCount: this.failureCount,
      lastFailureTime: this.lastFailureTime > 0 ? this.lastFailureTime : null,
    };
  }
}

// --- GCPRunExternalService.ts ---

/**
 * Configuration options specifically for connecting to a GCP Cloud Run service.
 */
export interface GCPRunServiceOptions {
  /** A descriptive name for the target service (used primarily for logging). */
  serviceName: string;

  /** The full base URL (e.g., `https://my-service-abcde.a.run.app`) of the target Cloud Run service. If not provided, it attempts to construct one using `serviceName`, `projectId`, and `region`. */
  baseUrl?: string;

  /** The Google Cloud Project ID where the target service is deployed. Tries to infer from `process.env.GOOGLE_CLOUD_PROJECT` if not provided. Required if `baseUrl` is not set. */
  projectId?: string;

  /** The Google Cloud Region where the target service is deployed (e.g., `us-central1`). Tries to infer from `process.env.GOOGLE_CLOUD_REGION` or defaults to `us-central1`. Used for constructing the URL if `baseUrl` is not set. */
  region?: string;

  /** Default request timeout in milliseconds. Default: 15000. */
  timeout?: number;

  /** Whether to automatically fetch and attach a GCP ID token (`Authorization: Bearer ...`) to outgoing requests. Set to `false` for publicly accessible services or if managing auth externally. Default: true. */
  useAuthentication?: boolean;

  /** The audience claim for the GCP ID token. If not provided, it defaults to the `baseUrl` of the service, which is standard for Cloud Run service-to-service authentication. */
  audience?: string;

  /** Custom retry options, overriding the defaults optimized for Cloud Run. */
  retryOptions?: RetryOptions; // Uses the common RetryOptions interface

  /** Custom circuit breaker options, overriding the defaults. */
  circuitBreakerOptions?: CircuitBreakerOptions;
}

/**
 * A specialized ExternalService client tailored for communicating with other
 * Google Cloud Run services.
 *
 * It automatically handles:
 * - Constructing the Cloud Run service URL (if not provided).
 * - GCP IAM ID Token authentication for service-to-service calls.
 * - Propagation of Cloud Trace context headers.
 * - Optimized default settings for retries and circuit breaking suitable for the Cloud Run environment.
 */
export class GCPRunExternalService extends ExternalService {
  protected readonly projectId: string;
  protected readonly region: string;
  protected readonly gcpAudience: string;
  protected readonly authEnabled: boolean;
  private googleAuth: any; // Cache GoogleAuth instance

  /**
   * Creates a new instance of the GCP Cloud Run service client.
   *
   * @param options Configuration options for connecting to the target Cloud Run service.
   * @param logger Optional pino logger instance.
   */
  constructor(options: GCPRunServiceOptions, logger?: Logger) {
    // 1. Determine Project ID and Region
    const projectId =
      options.projectId || process.env['GOOGLE_CLOUD_PROJECT'] || '';
    const region =
      options.region || process.env['GOOGLE_CLOUD_REGION'] || 'us-central1'; // Default region

    // 2. Determine Base URL
    let baseUrl = options.baseUrl;
    if (!baseUrl) {
      if (options.serviceName && projectId) {
        // Standard Cloud Run URL format for PROJECT_ID specified
        // Format: https://SERVICE-PROJECT_HASH.REGION.run.app (though often simpler URL works too)
        // Using the common format: https://[SERVICE_NAME]-[PROJECT_ID_HASH]-[REGION_CODE].run.app is complex.
        // The simplified format usually works for service-to-service:
        baseUrl = `https://${options.serviceName}-${projectId}.run.app`;
        // A more robust alternative requires calling metadata server or discovery APIs.
        // Fallback/alternative for potentially internal or regional URLs:
        // baseUrl = `https://${options.serviceName}.${region}.run.app`;
        logger?.warn(
          `Constructed baseUrl ${baseUrl} from serviceName and projectId. Verify this is correct for your Cloud Run networking setup.`,
        );
      } else if (options.serviceName) {
        // Attempt regional if only service name provided (less common, might be internal)
        baseUrl = `https://${options.serviceName}.${region}.run.app`;
        logger?.warn(
          `Constructed regional baseUrl ${baseUrl} from serviceName and region as projectId was missing. This might only work in specific network configurations.`,
        );
      } else {
        throw new Error(
          'Cannot initialize GCPRunExternalService: Either `baseUrl` or `serviceName` (with `projectId` preferred) must be provided in options.',
        );
      }
    }

    // Ensure URL ends cleanly, remove trailing slash if present
    if (baseUrl.endsWith('/')) {
      baseUrl = baseUrl.slice(0, -1);
    }

    // 3. Determine Authentication Settings
    const useAuth = options.useAuthentication !== false; // Default to true
    const audience = options.audience || baseUrl; // Default audience to the service URL

    // 4. Define Cloud Run Optimized Defaults (can be overridden by options)
    const defaultRetryOptions: Required<RetryOptions> = {
      retries: 5, // More retries often helpful in cloud environments
      factor: 1.5, // Slightly less aggressive backoff
      minTimeout: 500, // Start faster
      maxTimeout: 10000,
      randomize: true,
    };
    const defaultCircuitBreakerOptions: Required<CircuitBreakerOptions> = {
      enabled: true, // Enable by default for resilience
      failureThreshold: 5,
      resetTimeoutMs: 30000,
      halfOpenRequestThreshold: 1,
    };

    // 5. Initialize the Base Class (ExternalService) - *ONCE*
    // Pass calculated baseUrl, merged options, etc.
    super(
      options.serviceName,
      baseUrl,
      options.timeout ?? 15000, // Longer default timeout for potentially cold starts
      logger,
      { ...defaultRetryOptions, ...options.retryOptions }, // Merge user options over defaults
      { ...defaultCircuitBreakerOptions, ...options.circuitBreakerOptions }, // Merge user options over defaults
    );

    // 6. Store GCP specific properties
    this.projectId = projectId;
    this.region = region;
    this.authEnabled = useAuth;
    this.gcpAudience = audience;
    this.logger.info(
      {
        service: this.serviceName,
        baseUrl: this.baseUrl, // Use the final baseUrl from super class
        projectId: this.projectId || 'N/A',
        region: this.region,
        authenticated: this.authEnabled,
        audience: this.authEnabled ? this.gcpAudience : 'N/A',
      },
      `GCP Cloud Run service client '${this.serviceName}' initialized`,
    );
  }

  override async init(options?: ServiceInitOptions): Promise<void> {
    if (this.authEnabled) {
      const { GoogleAuth } = await import('google-auth-library');
      this.googleAuth = new GoogleAuth({
        scopes: ['https://www.googleapis.com/auth/cloud-platform'],
      });
    }
  }

  /**
   * Fetches a Google Cloud ID token for authenticating requests to the target Cloud Run service.
   * Caches the GoogleAuth client for efficiency.
   *
   * @returns The Authorization header value (e.g., "Bearer <token>").
   * @throws Error if fetching the ID token fails.
   */
  protected async getGcpIdToken(): Promise<string> {
    if (!this.googleAuth) {
      this.logger.error(
        'GoogleAuth client not initialized. Cannot get ID token.',
      );
      throw new Error(
        'GCP Authentication is enabled but GoogleAuth client failed to initialize.',
      );
    }
    try {
      // getIdTokenClient is efficient and handles caching the token internally
      const client = await this.googleAuth.getIdTokenClient(this.gcpAudience);
      const headers = await client.getRequestHeaders();
      if (!headers.Authorization) {
        this.logger.error(
          'getIdTokenClient succeeded but did not return an Authorization header.',
        );
        throw new Error(
          'Failed to obtain GCP ID token: No Authorization header received.',
        );
      }
      return headers.Authorization;
    } catch (error: unknown) {
      this.logger.error(
        {
          error: error instanceof Error ? error.message : error,
          audience: this.gcpAudience,
        },
        'Failed to obtain GCP ID token',
      );
      throw new Error(
        `GCP ID token fetch failed for audience ${this.gcpAudience}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Overrides the base authentication method to inject the GCP ID token.
   * If authentication is disabled for this service, this method does nothing.
   *
   * @param headers The headers object for the outgoing request.
   */
  override async authenticate(headers: Record<string, string>): Promise<void> {
    if (this.authEnabled) {
      this.logger.debug(
        `Workspaceing GCP ID token for audience: ${this.gcpAudience}`,
      );
      try {
        const token = await this.getGcpIdToken();
        headers['Authorization'] = token; // Add or replace Authorization header
      } catch (error) {
        // Error is already logged in getGcpIdToken
        this.logger.error(
          `Failed to authenticate request to ${this.serviceName} due to ID token error.`,
        );
        // Re-throw as an ExternalServiceError or similar to indicate auth phase failure
        throw new ExternalServiceError(
          'GCP authentication failed: Could not obtain ID token.',
          { cause: error },
        );
      }
    } else {
      this.logger.debug(
        `GCP authentication skipped for ${this.serviceName} as it's disabled.`,
      );
    }
  }

  /**
   * Overrides the base request method to automatically add common GCP headers like
   * `x-request-id` and propagate `x-cloud-trace-context`.
   */
  protected override async request<T>(
    method: string,
    path: string,
    options?: {
      data?: any;
      params?: Record<string, string>;
      headers?: Record<string, string>;
      timeout?: number;
      signal?: AbortSignal | null;
      traceContext?: TraceContext;
    },
  ): Promise<T> {
    const headers = options?.headers || {};

    // 1. Add Request ID for tracing/logging consistency
    if (!headers['x-request-id']) {
      headers['x-request-id'] = this.generateRequestId();
    }

    // 2. Propagate Cloud Trace Context (handled by base class now, just ensure it gets there)
    // The base class `request` method already handles adding traceContext from options.
    // We just ensure the traceContext is passed down correctly.

    // 3. Call the base class request method with potentially modified headers
    return super.request<T>(method, path, {
      ...options,
      headers, // Pass the potentially updated headers object
    });
  }

  /**
   * Generates a simple unique request ID.
   * Format: req-<timestamp>-<random>
   */
  private generateRequestId(): string {
    // Simple request ID generator
    return `req-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * Gets information about the configured connection to the Cloud Run service.
   */
  public getServiceInfo(): {
    serviceName: string;
    baseUrl: string;
    projectId: string;
    region: string;
    authenticated: boolean;
    audience: string | null;
  } {
    return {
      serviceName: this.serviceName,
      baseUrl: this.baseUrl,
      projectId: this.projectId,
      region: this.region,
      authenticated: this.authEnabled,
      audience: this.authEnabled ? this.gcpAudience : null,
    };
  }

  /**
   * Checks if this client is configured to use GCP authentication.
   */
  public isAuthenticated(): boolean {
    return this.authEnabled;
  }

  /**
   * Performs a health check specifically for Cloud Run services.
   * It tries the standard Google Cloud health check endpoint `/ah/health` first,
   * and falls back to checking the root path `/` if the first attempt fails.
   *
   * @param primaryPath The preferred health check path. Default: '/_ah/health'.
   * @param fallbackPath The path to try if the primary path fails. Default: '/'.
   * @param timeout Timeout for each health check attempt. Default: 5000ms.
   * @returns True if either health check endpoint returns a successful status (2xx), false otherwise.
   */
  public async checkHealth(
    primaryPath: string = '/_ah/health',
    fallbackPath: string = '/',
    timeout: number = 5000,
  ): Promise<boolean> {
    this.logger.info(
      `Performing Cloud Run health check for ${this.serviceName} using ${primaryPath}`,
    );
    const primaryCheckOk = await this.healthCheck(primaryPath, timeout);

    if (primaryCheckOk) {
      this.logger.info(
        `Health check successful for ${this.serviceName} on ${primaryPath}`,
      );
      return true;
    } else {
      this.logger.warn(
        `Health check failed or timed out on ${primaryPath} for ${this.serviceName}, trying fallback path ${fallbackPath}`,
      );
      const fallbackCheckOk = await this.healthCheck(fallbackPath, timeout);
      if (fallbackCheckOk) {
        this.logger.info(
          `Health check successful for ${this.serviceName} on fallback path ${fallbackPath}`,
        );
        return true;
      } else {
        this.logger.error(
          `Health check failed for ${this.serviceName} on both ${primaryPath} and ${fallbackPath}`,
        );
        return false;
      }
    }
  }
}

/**
 * Factory function to simplify the creation of a GCPRunExternalService instance.
 *
 * @param options Configuration options for the target Cloud Run service.
 * @param logger Optional pino logger instance.
 * @returns A new, configured GCPRunExternalService instance.
 */
export function createCloudRunService(
  options: GCPRunServiceOptions,
  logger?: Logger,
): GCPRunExternalService {
  return new GCPRunExternalService(options, logger);
}
