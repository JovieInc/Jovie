/**
 * Unified Rate Limiting Types
 *
 * Shared type definitions for the rate limiting system.
 */

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
