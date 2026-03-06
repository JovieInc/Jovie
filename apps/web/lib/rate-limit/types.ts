/**
 * Unified Rate Limiting Types
 *
 * Shared type definitions for the rate limiting system.
 */

import type { PlanId } from '@/lib/entitlements/registry';

/**
 * Result of a rate limit check
 */
export interface RateLimitResult {
  /** Whether the request is allowed */
  success: boolean;
  /** Maximum requests allowed in the window */
  limit: number;
  /** Remaining requests in the current window */
  remaining: number;
  /** When the current window resets */
  reset: Date;
  /** Optional reason for rate limit failure */
  reason?: string;
}

/**
 * Rate limit configuration for a specific limiter
 */
export interface RateLimitConfig {
  /** Human-readable name for this limiter */
  name: string;
  /** Maximum requests allowed in the window */
  limit: number;
  /** Window duration (e.g., '1 m', '1 h', '1 d') */
  window: string;
  /** Redis key prefix */
  prefix: string;
  /** Whether to enable Upstash analytics */
  analytics?: boolean;
}

/**
 * Rate limit status with additional metadata
 */
export interface RateLimitStatus {
  limit: number;
  remaining: number;
  resetTime: number;
  blocked: boolean;
  retryAfterSeconds: number;
}

/**
 * Types of public endpoints for rate limiting
 */
export type PublicEndpointType = 'profile' | 'click' | 'visit';

/**
 * Types of tracking endpoints for rate limiting
 */
export type TrackingEndpointType = 'click' | 'visit';

/**
 * Key types for rate limiting
 */
export type RateLimitKeyType = 'user' | 'ip' | 'creator' | 'custom';

// ============================================================================
// Plan-Aware Rate Limiting Types
// ============================================================================

/**
 * Configuration mapping plans to rate limit configs.
 * Each plan tier can have its own rate limit configuration.
 * Plans not specified will fall back to the 'free' config.
 */
export type PlanRateLimitConfig = Partial<Record<PlanId, RateLimitConfig>> & {
  /** Required: Default config for free tier and unknown plans */
  free: RateLimitConfig;
};

/**
 * Options for creating a plan-aware rate limiter
 */
export interface PlanAwareLimiterOptions {
  /** Plan-to-config mapping */
  configs: PlanRateLimitConfig;
  /** Custom error message generator per plan */
  errorMessage?: (plan: PlanId | null) => string;
  /** Whether to prefer Redis over in-memory (default: true) */
  preferRedis?: boolean;
}

/**
 * A rate limiter that automatically selects the correct limiter
 * based on the user's plan tier.
 */
export interface PlanAwareRateLimiter {
  /**
   * Check rate limit for an identifier with a specific plan.
   * Automatically selects the appropriate rate limiter based on plan.
   *
   * @param identifier - The unique identifier for the rate limit (e.g., userId)
   * @param plan - The user's plan tier (null/undefined defaults to 'free')
   */
  limit(
    identifier: string,
    plan: PlanId | string | null | undefined
  ): Promise<RateLimitResult>;

  /**
   * Get current status without incrementing the counter.
   * Uses the appropriate limiter based on plan.
   *
   * @param identifier - The unique identifier for the rate limit
   * @param plan - The user's plan tier (null/undefined defaults to 'free')
   */
  getStatus(
    identifier: string,
    plan: PlanId | string | null | undefined
  ): RateLimitStatus;

  /**
   * Check if the request would be rate limited (without incrementing).
   *
   * @param identifier - The unique identifier for the rate limit
   * @param plan - The user's plan tier (null/undefined defaults to 'free')
   */
  wouldBeRateLimited(
    identifier: string,
    plan: PlanId | string | null | undefined
  ): Promise<boolean>;

  /**
   * Get the configuration for a specific plan.
   *
   * @param plan - The plan tier to get config for
   */
  getConfigForPlan(plan: PlanId | string | null | undefined): RateLimitConfig;
}
