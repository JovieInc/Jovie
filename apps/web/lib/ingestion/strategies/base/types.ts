/**
 * Base Extraction Types
 *
 * Type definitions for ingestion strategies.
 */

export interface FetchOptions {
  /** Request timeout in milliseconds (default: 10000) */
  timeoutMs?: number;
  /** Maximum number of retry attempts (default: 2) */
  maxRetries?: number;
  /** Custom user agent string */
  userAgent?: string;
  /** Additional headers */
  headers?: Record<string, string>;
  /** When set, only allow requests (including redirects) to these hostnames */
  allowedHosts?: Set<string>;
  /** Maximum response size in bytes (default: 2_000_000) */
  maxResponseBytes?: number;
}

export interface FetchResult {
  html: string;
  statusCode: number;
  finalUrl: string;
  contentType: string | null;
}

export interface StrategyConfig {
  /** Platform identifier (e.g., 'linktree', 'beacons') */
  platformId: string;
  /** Display name for logging */
  platformName: string;
  /** Preferred canonical host for normalized URLs */
  canonicalHost: string;
  /** Valid hostnames for this platform */
  validHosts: Set<string>;
  /** Default fetch timeout */
  defaultTimeoutMs: number;
}

export type ExtractionErrorCode =
  | 'INVALID_URL'
  | 'INVALID_HOST'
  | 'INVALID_HANDLE'
  | 'FETCH_FAILED'
  | 'FETCH_TIMEOUT'
  | 'RATE_LIMITED'
  | 'NOT_FOUND'
  | 'PARSE_ERROR'
  | 'EMPTY_RESPONSE';

export class ExtractionError extends Error {
  constructor(
    message: string,
    public readonly code: ExtractionErrorCode,
    public readonly statusCode?: number,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = 'ExtractionError';
  }
}

export interface LinkExtractionOptions {
  skipHosts: Set<string>;
  sourcePlatform: string;
  sourceSignal: string;
}
