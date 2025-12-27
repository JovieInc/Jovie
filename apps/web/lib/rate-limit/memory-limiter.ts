/**
 * In-Memory Rate Limiter
 *
 * A simple in-memory rate limiter for development and fallback scenarios.
 * Note: Not persistent across server restarts and doesn't scale across instances.
 */

import { parseWindowToMs } from './config';
import type {
  RateLimitConfig,
  RateLimitResult,
  RateLimitStatus,
} from './types';

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

/**
 * Global in-memory store for rate limiting
 * Shared across all MemoryRateLimiter instances
 */
const rateLimitStore = new Map<string, RateLimitEntry>();

/**
 * Clean up expired entries to prevent memory leaks
 */
function cleanupExpiredEntries(): void {
  const now = Date.now();
  const keysToDelete: string[] = [];

  for (const [key, entry] of rateLimitStore.entries()) {
    if (now > entry.resetTime) {
      keysToDelete.push(key);
    }
  }

  for (const key of keysToDelete) {
    rateLimitStore.delete(key);
  }
}

/**
 * In-memory rate limiter class
 */
export class MemoryRateLimiter {
  private readonly config: RateLimitConfig;
  private readonly windowMs: number;

  constructor(config: RateLimitConfig) {
    this.config = config;
    this.windowMs = parseWindowToMs(config.window);
  }

  /**
   * Check if the identifier has exceeded the rate limit
   * Returns a result compatible with Upstash Ratelimit
   */
  async limit(identifier: string): Promise<RateLimitResult> {
    const now = Date.now();
    const key = `${this.config.prefix}:${identifier}`;
    const existing = rateLimitStore.get(key);

    // Probabilistic cleanup (10% chance per request)
    if (Math.random() < 0.1) {
      cleanupExpiredEntries();
    }

    // First request or window expired
    if (!existing || now > existing.resetTime) {
      const resetTime = now + this.windowMs;
      rateLimitStore.set(key, {
        count: 1,
        resetTime,
      });

      return {
        success: true,
        limit: this.config.limit,
        remaining: this.config.limit - 1,
        reset: new Date(resetTime),
      };
    }

    // Check if limit exceeded
    if (existing.count >= this.config.limit) {
      return {
        success: false,
        limit: this.config.limit,
        remaining: 0,
        reset: new Date(existing.resetTime),
        reason: `${this.config.name} rate limit exceeded`,
      };
    }

    // Increment counter
    existing.count += 1;
    rateLimitStore.set(key, existing);

    return {
      success: true,
      limit: this.config.limit,
      remaining: this.config.limit - existing.count,
      reset: new Date(existing.resetTime),
    };
  }

  /**
   * Get current rate limit status without incrementing counter
   */
  getStatus(identifier: string): RateLimitStatus {
    const now = Date.now();
    const key = `${this.config.prefix}:${identifier}`;
    const existing = rateLimitStore.get(key);

    if (!existing || now > existing.resetTime) {
      return {
        limit: this.config.limit,
        remaining: this.config.limit,
        resetTime: now + this.windowMs,
        blocked: false,
        retryAfterSeconds: 0,
      };
    }

    const remaining = Math.max(0, this.config.limit - existing.count);
    const blocked = existing.count >= this.config.limit;
    const retryAfterSeconds = blocked
      ? Math.ceil((existing.resetTime - now) / 1000)
      : 0;

    return {
      limit: this.config.limit,
      remaining,
      resetTime: existing.resetTime,
      blocked,
      retryAfterSeconds,
    };
  }

  /**
   * Reset the rate limit for an identifier (useful for testing)
   */
  reset(identifier: string): void {
    const key = `${this.config.prefix}:${identifier}`;
    rateLimitStore.delete(key);
  }

  /**
   * Get the limiter configuration
   */
  getConfig(): RateLimitConfig {
    return this.config;
  }
}

/**
 * Force cleanup of all expired entries (useful for testing or maintenance)
 */
export function forceCleanup(): void {
  cleanupExpiredEntries();
}

/**
 * Get the current size of the rate limit store (useful for monitoring)
 */
export function getStoreSize(): number {
  return rateLimitStore.size;
}

/**
 * Clear all entries (useful for testing)
 */
export function clearStore(): void {
  rateLimitStore.clear();
}
