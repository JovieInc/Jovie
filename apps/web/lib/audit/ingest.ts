/**
 * Ingest Audit Logging
 *
 * Provides structured audit logging for all Spotify ingest operations.
 * Logs are written in a structured format for analysis and compliance.
 *
 * Security considerations:
 * - All claim attempts (success or failure) are logged
 * - IP addresses and user agents are captured for security analysis
 * - Sensitive data (tokens, secrets) are never logged
 * - Logs can be easily extended to write to a database table
 */

import { headers } from 'next/headers';

// ============================================================================
// Types
// ============================================================================

/**
 * Ingest event types for audit logging.
 */
export type IngestEventType =
  // Search events
  | 'ARTIST_SEARCH'
  | 'ARTIST_SEARCH_RATE_LIMITED'
  // Claim events
  | 'ARTIST_CLAIM_ATTEMPT'
  | 'ARTIST_CLAIM_SUCCESS'
  | 'ARTIST_CLAIM_FAILED'
  | 'ARTIST_CLAIM_RATE_LIMITED'
  // Data refresh events
  | 'ARTIST_DATA_REFRESH'
  | 'ARTIST_DATA_REFRESH_FAILED'
  // OAuth events
  | 'SPOTIFY_OAUTH_START'
  | 'SPOTIFY_OAUTH_CALLBACK'
  | 'SPOTIFY_OAUTH_SUCCESS'
  | 'SPOTIFY_OAUTH_FAILED';

/**
 * Base structure for all ingest audit events.
 */
export interface IngestAuditEvent {
  type: IngestEventType;
  userId?: string;
  artistId?: string;
  spotifyId?: string;
  handle?: string;
  action?: string;
  result?: 'success' | 'failure';
  failureReason?: string;
  ip?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Formatted audit log entry.
 */
export interface AuditLogEntry extends IngestAuditEvent {
  timestamp: string;
  level: 'info' | 'warn' | 'error';
}

// ============================================================================
// Utilities
// ============================================================================

/**
 * Get the current request's IP address and user agent.
 * Safe to call from server components and server actions.
 */
export async function getRequestContext(): Promise<{
  ip: string;
  userAgent: string | null;
}> {
  const headersList = await headers();
  const userAgent = headersList.get('user-agent');

  // Use the rate-limit utility to get IP
  // We need to create a mock Request for the utility
  const ip = await getClientIPFromHeaders(headersList);

  return { ip, userAgent };
}

/**
 * Extract client IP from headers directly.
 */
async function getClientIPFromHeaders(headersList: Headers): Promise<string> {
  // Priority: CF > Vercel > Real IP > Forwarded
  const cfConnectingIp = headersList.get('cf-connecting-ip');
  const xForwardedFor = headersList.get('x-forwarded-for');
  const xRealIp = headersList.get('x-real-ip');

  if (cfConnectingIp) return cfConnectingIp;
  if (xRealIp) return xRealIp;
  if (xForwardedFor) return xForwardedFor.split(',')[0].trim();

  return 'unknown';
}

/**
 * Determine log level based on event type.
 */
function getLogLevel(type: IngestEventType): 'info' | 'warn' | 'error' {
  if (type.includes('FAILED') || type.includes('ERROR')) {
    return 'error';
  }
  if (type.includes('RATE_LIMITED')) {
    return 'warn';
  }
  return 'info';
}

/**
 * Sanitize metadata to remove sensitive fields.
 */
function sanitizeMetadata(
  metadata?: Record<string, unknown>
): Record<string, unknown> | undefined {
  if (!metadata) return undefined;

  const sensitiveKeys = [
    'token',
    'secret',
    'password',
    'key',
    'authorization',
    'accessToken',
    'refreshToken',
    'access_token',
    'refresh_token',
  ];

  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(metadata)) {
    const lowerKey = key.toLowerCase();
    const isSensitive = sensitiveKeys.some(sensitive =>
      lowerKey.includes(sensitive.toLowerCase())
    );

    if (isSensitive) {
      sanitized[key] = '[REDACTED]';
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

// ============================================================================
// Audit Logging Functions
// ============================================================================

/**
 * Log an ingest audit event.
 *
 * This function:
 * 1. Enriches the event with timestamp and request context
 * 2. Logs to console in structured format
 * 3. Can be extended to write to database or external service
 *
 * @param event - The audit event to log
 */
export async function logIngestEvent(event: IngestAuditEvent): Promise<void> {
  const { ip, userAgent } = await getRequestContext();

  const logEntry: AuditLogEntry = {
    ...event,
    ip: event.ip ?? ip,
    userAgent: event.userAgent ?? userAgent ?? undefined,
    timestamp: new Date().toISOString(),
    level: getLogLevel(event.type),
    metadata: sanitizeMetadata(event.metadata),
  };

  // Log in structured format
  const logPrefix = `[Ingest Audit] [${logEntry.level.toUpperCase()}]`;

  switch (logEntry.level) {
    case 'error':
      console.error(logPrefix, logEntry);
      break;
    case 'warn':
      console.warn(logPrefix, logEntry);
      break;
    default:
      console.log(logPrefix, logEntry);
  }

  // See JOV-481: Implement audit log persistence to database
  // await writeToDatabase(logEntry);
  // await sendToAuditService(logEntry);
}

// ============================================================================
// Convenience Logging Functions
// ============================================================================

/**
 * Log a search event.
 */
export async function logSearchEvent(
  userId: string | undefined,
  query: string,
  resultCount: number
): Promise<void> {
  await logIngestEvent({
    type: 'ARTIST_SEARCH',
    userId,
    result: 'success',
    metadata: {
      query,
      resultCount,
    },
  });
}

/**
 * Log a search rate limit event.
 */
export async function logSearchRateLimited(
  userId: string | undefined,
  ipAddress: string
): Promise<void> {
  await logIngestEvent({
    type: 'ARTIST_SEARCH_RATE_LIMITED',
    userId,
    ip: ipAddress,
    result: 'failure',
    failureReason: 'RATE_LIMITED',
  });
}

/**
 * Log a claim attempt.
 */
export async function logClaimAttempt(
  userId: string,
  spotifyId: string,
  handle: string
): Promise<void> {
  await logIngestEvent({
    type: 'ARTIST_CLAIM_ATTEMPT',
    userId,
    spotifyId,
    handle,
    action: 'claim_started',
  });
}

/**
 * Log a successful claim.
 */
export async function logClaimSuccess(
  userId: string,
  spotifyId: string,
  handle: string,
  artistId: string
): Promise<void> {
  await logIngestEvent({
    type: 'ARTIST_CLAIM_SUCCESS',
    userId,
    spotifyId,
    artistId,
    handle,
    action: 'claimed',
    result: 'success',
  });
}

/**
 * Log a failed claim.
 */
export async function logClaimFailed(
  userId: string,
  spotifyId: string,
  handle: string,
  failureReason: string
): Promise<void> {
  await logIngestEvent({
    type: 'ARTIST_CLAIM_FAILED',
    userId,
    spotifyId,
    handle,
    action: 'claim_failed',
    result: 'failure',
    failureReason,
  });
}

/**
 * Log a claim rate limit event.
 */
export async function logClaimRateLimited(userId: string): Promise<void> {
  await logIngestEvent({
    type: 'ARTIST_CLAIM_RATE_LIMITED',
    userId,
    result: 'failure',
    failureReason: 'RATE_LIMITED',
  });
}

/**
 * Log a data refresh event.
 */
export async function logDataRefresh(
  userId: string,
  artistId: string,
  spotifyId: string,
  success: boolean,
  failureReason?: string
): Promise<void> {
  await logIngestEvent({
    type: success ? 'ARTIST_DATA_REFRESH' : 'ARTIST_DATA_REFRESH_FAILED',
    userId,
    artistId,
    spotifyId,
    action: 'data_refresh',
    result: success ? 'success' : 'failure',
    failureReason,
  });
}

/**
 * Log OAuth start.
 */
export async function logOAuthStart(userId: string): Promise<void> {
  await logIngestEvent({
    type: 'SPOTIFY_OAUTH_START',
    userId,
    action: 'oauth_initiated',
  });
}

/**
 * Log OAuth callback received.
 */
export async function logOAuthCallback(
  userId: string,
  hasCode: boolean,
  hasState: boolean
): Promise<void> {
  await logIngestEvent({
    type: 'SPOTIFY_OAUTH_CALLBACK',
    userId,
    action: 'oauth_callback',
    metadata: {
      hasCode,
      hasState,
    },
  });
}

/**
 * Log OAuth success.
 */
export async function logOAuthSuccess(userId: string): Promise<void> {
  await logIngestEvent({
    type: 'SPOTIFY_OAUTH_SUCCESS',
    userId,
    action: 'oauth_completed',
    result: 'success',
  });
}

/**
 * Log OAuth failure.
 */
export async function logOAuthFailed(
  userId: string,
  failureReason: string
): Promise<void> {
  await logIngestEvent({
    type: 'SPOTIFY_OAUTH_FAILED',
    userId,
    action: 'oauth_failed',
    result: 'failure',
    failureReason,
  });
}
