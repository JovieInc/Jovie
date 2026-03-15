/**
 * Unified Rate Limiter
 *
 * A rate limiter that uses Redis when available and falls back to in-memory storage.
 * Provides a consistent interface regardless of the underlying storage mechanism.
 */

import * as Sentry from '@sentry/nextjs';
import type { Ratelimit } from '@upstash/ratelimit';
import { env } from '@/lib/env-server';
import { parseWindowToMs } from './config';
import { MemoryRateLimiter } from './memory-limiter';
import { createRedisRateLimiter, isRedisAvailable } from './redis-limiter';
import type {
  RateLimitConfig,
  RateLimitResult,
  RateLimitStatus,
} from './types';

export type RateLimiterBackend = 'redis' | 'memory';

/**
 * Options for creating a rate limiter
 */
export interface RateLimiterOptions {
  /** Whether to prefer Redis over in-memory (default: true) */
  preferRedis?: boolean;
  /** Whether Redis is required and memory fallback must be disabled */
  requireRedis?: boolean;
  /** Whether to log warnings when falling back to memory (default: true in production) */
  warnOnFallback?: boolean;
  /** Custom logger function */
  logger?: (message: string) => void;
}

/**
 * Unified Rate Limiter
 *
 * Automatically uses Redis when available, falls back to in-memory otherwise.
 */
export class RateLimiter {
  private readonly config: RateLimitConfig;
  private readonly redisLimiter: Ratelimit | null;
  private readonly memoryLimiter: MemoryRateLimiter;
  private readonly options: Required<RateLimiterOptions>;

  constructor(config: RateLimitConfig, options: RateLimiterOptions = {}) {
    this.config = config;
    this.options = {
      preferRedis: options.preferRedis ?? true,
      requireRedis: options.requireRedis ?? false,
      warnOnFallback: options.warnOnFallback ?? env.NODE_ENV === 'production',
      logger:
        options.logger ??
        ((msg: string) =>
          Sentry.addBreadcrumb({
            category: 'rate-limiter',
            message: msg,
            level: 'warning',
          })),
    };

    // Initialize both backends
    this.redisLimiter = this.options.preferRedis
      ? createRedisRateLimiter(config)
      : null;
    this.memoryLimiter = new MemoryRateLimiter(config);

    // Warn loudly if falling back to in-memory in production — rate limits
    // stored in memory reset on every Vercel deploy and don't share state
    // across instances, making them effectively useless in production.
    if (
      this.options.preferRedis &&
      !this.redisLimiter &&
      this.options.warnOnFallback
    ) {
      const message = `[RateLimit:${config.name}] Redis unavailable, using in-memory fallback — rate limits will reset on deploy`;
      console.error(message);
      this.options.logger(message);
    }
  }

  /**
   * Check rate limit for an identifier
   * Returns a consistent result regardless of backend
   */
  async limit(identifier: string): Promise<RateLimitResult> {
    // Try Redis first if available
    if (this.redisLimiter) {
      try {
        const result = await this.redisLimiter.limit(identifier);
        return {
          success: result.success,
          limit: result.limit,
          remaining: result.remaining,
          reset: new Date(result.reset),
          reason: result.success
            ? undefined
            : `${this.config.name} rate limit exceeded`,
        };
      } catch (error) {
        // Log error and fall back to memory — this means rate limits for this
        // request are enforced in-memory only and won't persist across deploys.
        const message = `[RateLimit:${this.config.name}] Redis error, falling back to in-memory: ${error}`;
        console.error(message);
        this.options.logger(message);
      }
    }

    if (this.options.requireRedis) {
      return {
        success: false,
        limit: this.config.limit,
        remaining: 0,
        reset: new Date(Date.now() + parseWindowToMs(this.config.window)),
        reason: `${this.config.name} rate limiter is temporarily unavailable`,
      };
    }

    // Fall back to in-memory
    return this.memoryLimiter.limit(identifier);
  }

  /**
   * Get current status without incrementing the counter
   */
  getStatus(identifier: string): RateLimitStatus {
    return this.memoryLimiter.getStatus(identifier);
  }

  /**
   * Check if the request would be rate limited (without incrementing)
   */
  async wouldBeRateLimited(identifier: string): Promise<boolean> {
    const status = this.getStatus(identifier);
    return status.blocked;
  }

  /**
   * Get the active backend type
   */
  getBackend(): RateLimiterBackend {
    return this.redisLimiter ? 'redis' : 'memory';
  }

  /**
   * Check if Redis backend is active
   */
  isRedisActive(): boolean {
    return this.redisLimiter !== null;
  }

  /**
   * Get the limiter configuration
   */
  getConfig(): RateLimitConfig {
    return this.config;
  }

  /**
   * Reset rate limit for an identifier (memory only - Redis uses TTL)
   */
  reset(identifier: string): void {
    this.memoryLimiter.reset(identifier);
  }
}

/**
 * Create a rate limiter with the given configuration
 */
export function createRateLimiter(
  config: RateLimitConfig,
  options?: RateLimiterOptions
): RateLimiter {
  return new RateLimiter(config, options);
}

/**
 * Check if rate limiting is enabled (Redis available)
 */
export function isRateLimitingEnabled(): boolean {
  return isRedisAvailable();
}
