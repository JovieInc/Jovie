import 'server-only';

/**
 * Admin Impersonation Module
 *
 * Provides secure, audited admin impersonation capabilities.
 * Only database-verified admins can initiate impersonation.
 * All sessions are logged to admin_audit_log.
 *
 * Security guarantees:
 * - HMAC-SHA256 signed tokens with timing-safe comparison
 * - 15-minute maximum session duration
 * - httpOnly cookies prevent XSS token theft
 * - All actions are audit logged
 * - Real admin identity always tracked alongside effective user
 */

import crypto from 'node:crypto';
import { eq } from 'drizzle-orm';
import { cookies } from 'next/headers';
import { checkUserStatus } from '@/lib/auth/status-checker';
import { db } from '@/lib/db';
import { adminAuditLog } from '@/lib/db/schema/admin';
import { users } from '@/lib/db/schema/auth';
import { env, isSecureEnv } from '@/lib/env-server';
import { isAdmin } from './roles';

// Cookie name for impersonation token
export const IMPERSONATION_COOKIE = 'jovie_impersonate';

// Token validity: 15 minutes maximum
const TOKEN_TTL_MS = 15 * 60 * 1000;

// Maximum clock skew allowed: 30 seconds
const MAX_CLOCK_SKEW_MS = 30 * 1000;

/**
 * Get the impersonation secret from environment
 * Falls back to URL_ENCRYPTION_KEY if IMPERSONATION_SECRET not set
 */
function getImpersonationSecret(): string | undefined {
  return env.IMPERSONATION_SECRET || env.URL_ENCRYPTION_KEY;
}

/**
 * Check if impersonation is enabled
 */
export function isImpersonationEnabled(): boolean {
  const secret = getImpersonationSecret();
  const hasSecret = Boolean(secret);

  // In production, also require explicit opt-in
  if (env.NODE_ENV === 'production') {
    return hasSecret && env.ENABLE_IMPERSONATION === 'true';
  }

  return hasSecret;
}

/**
 * Impersonation token payload
 */
export interface ImpersonationToken {
  /** The administrator's canonical app user ID (`users.id`). */
  realAdminUserId: string;
  /** The target's canonical app user ID (`users.id`). */
  effectiveUserId: string;
  /** When the token was issued (epoch ms) */
  issuedAt: number;
  /** When the token expires (epoch ms) */
  expiresAt: number;
}

/**
 * Result of impersonation token validation
 */
export interface ImpersonationValidation {
  valid: boolean;
  token?: ImpersonationToken;
  error?: string;
}

/**
 * Generate HMAC-SHA256 signature for impersonation token
 */
function generateSignature(
  payload: Omit<ImpersonationToken, 'signature'>
): string {
  const secret = getImpersonationSecret();
  if (!secret) {
    throw new TypeError('Impersonation secret not configured');
  }

  const data = `${payload.realAdminUserId}:${payload.effectiveUserId}:${payload.issuedAt}:${payload.expiresAt}`;
  return crypto.createHmac('sha256', secret).update(data).digest('hex');
}

/**
 * Serialize token to string for cookie storage
 * Format: realAdminUserId:effectiveUserId:issuedAt:expiresAt:signature
 */
function serializeToken(token: ImpersonationToken): string {
  const signature = generateSignature(token);
  return `${token.realAdminUserId}:${token.effectiveUserId}:${token.issuedAt}:${token.expiresAt}:${signature}`;
}

/**
 * Parse and validate token from string
 */
function parseToken(tokenString: string): ImpersonationValidation {
  if (!isImpersonationEnabled()) {
    return { valid: false, error: 'Impersonation is disabled' };
  }

  const parts = tokenString.split(':');
  if (parts.length !== 5) {
    return { valid: false, error: 'Invalid token format' };
  }

  const [
    realAdminUserId,
    effectiveUserId,
    issuedAtStr,
    expiresAtStr,
    signature,
  ] = parts;

  const issuedAt = Number.parseInt(issuedAtStr, 10);
  const expiresAt = Number.parseInt(expiresAtStr, 10);

  if (Number.isNaN(issuedAt) || Number.isNaN(expiresAt)) {
    return { valid: false, error: 'Invalid timestamp' };
  }

  const token: ImpersonationToken = {
    realAdminUserId,
    effectiveUserId,
    issuedAt,
    expiresAt,
  };

  // Check expiry
  const now = Date.now();
  if (now > expiresAt) {
    return { valid: false, error: 'Token expired' };
  }

  // Prevent future-dated tokens (clock skew protection)
  if (issuedAt > now + MAX_CLOCK_SKEW_MS) {
    return { valid: false, error: 'Token issued in future' };
  }

  // Verify signature
  const expectedSignature = generateSignature(token);
  const signatureBuffer = Buffer.from(signature, 'hex');
  const expectedBuffer = Buffer.from(expectedSignature, 'hex');

  if (
    signatureBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(signatureBuffer, expectedBuffer)
  ) {
    return { valid: false, error: 'Invalid signature' };
  }

  return { valid: true, token };
}

/**
 * Start an impersonation session
 *
 * @param adminUserId - The canonical app user ID of the administrator
 * @param targetUserId - The canonical app user ID of the target
 * @param ipAddress - IP address of the request (for audit)
 * @param userAgent - User agent of the request (for audit)
 * @returns Result indicating success or failure with error message
 */
export async function startImpersonation(
  adminUserId: string,
  targetUserId: string,
  ipAddress?: string,
  userAgent?: string
): Promise<{ success: boolean; error?: string }> {
  if (!isImpersonationEnabled()) {
    return { success: false, error: 'Impersonation is disabled' };
  }

  // Verify the requester is actually an admin
  const adminStatus = await isAdmin(adminUserId);
  if (!adminStatus) {
    return { success: false, error: 'Not authorized - admin access required' };
  }

  if (adminUserId === targetUserId) {
    return { success: false, error: 'Cannot impersonate yourself' };
  }

  // Get target user's database info
  const [targetUser] = await db
    .select({
      id: users.id,
      betterAuthUserId: users.betterAuthUserId,
      email: users.email,
      deletedAt: users.deletedAt,
      userStatus: users.userStatus,
    })
    .from(users)
    .where(eq(users.id, targetUserId))
    .limit(1);

  if (!targetUser) {
    return { success: false, error: 'Target user not found' };
  }

  if (checkUserStatus(targetUser.userStatus, targetUser.deletedAt).isBlocked) {
    return {
      success: false,
      error: 'Cannot impersonate a blocked user',
    };
  }

  if (!targetUser.betterAuthUserId || !targetUser.email) {
    return {
      success: false,
      error: 'Target user does not have a Better Auth identity',
    };
  }

  // Create the token
  const now = Date.now();
  const token: ImpersonationToken = {
    realAdminUserId: adminUserId,
    effectiveUserId: targetUser.id,
    issuedAt: now,
    expiresAt: now + TOKEN_TTL_MS,
  };

  const tokenString = serializeToken(token);

  // Persist the required audit record before activating the session. A failed
  // audit write must never leave the browser impersonating after a 500.
  await db.insert(adminAuditLog).values({
    adminUserId,
    targetUserId: targetUser.id,
    action: 'impersonation_started',
    metadata: {
      targetUserId,
      issuedAt: now,
      expiresAt: now + TOKEN_TTL_MS,
      ttlMinutes: TOKEN_TTL_MS / 60000,
    },
    ipAddress: ipAddress ?? null,
    userAgent: userAgent ?? null,
  });

  const cookieStore = await cookies();
  cookieStore.set(IMPERSONATION_COOKIE, tokenString, {
    httpOnly: true,
    secure: isSecureEnv(),
    sameSite: 'lax',
    maxAge: Math.floor(TOKEN_TTL_MS / 1000), // Convert to seconds
    path: '/',
  });

  return { success: true };
}

/**
 * End the current impersonation session
 */
export async function endImpersonation(
  realAdminUserId?: string,
  ipAddress?: string,
  userAgent?: string
): Promise<{ success: boolean }> {
  const cookieStore = await cookies();
  const tokenString = cookieStore.get(IMPERSONATION_COOKIE)?.value;

  try {
    if (tokenString) {
      const validation = parseToken(tokenString);
      if (
        validation.valid &&
        validation.token &&
        (!realAdminUserId ||
          validation.token.realAdminUserId === realAdminUserId)
      ) {
        await db.insert(adminAuditLog).values({
          adminUserId: validation.token.realAdminUserId,
          targetUserId: validation.token.effectiveUserId,
          action: 'impersonation_ended',
          metadata: {
            targetUserId: validation.token.effectiveUserId,
            sessionDurationMs: Date.now() - validation.token.issuedAt,
          },
          ipAddress: ipAddress ?? null,
          userAgent: userAgent ?? null,
        });
      }
    }
  } finally {
    // Ending is fail-closed for access even when audit persistence is down.
    cookieStore.delete(IMPERSONATION_COOKIE);
  }

  return { success: true };
}

/**
 * Get current impersonation state
 * Returns the validated token if impersonation is active, null otherwise
 */
export async function getImpersonationState(
  realAdminUserId?: string
): Promise<ImpersonationToken | null> {
  if (!isImpersonationEnabled()) {
    return null;
  }

  const cookieStore = await cookies();
  const tokenString = cookieStore.get(IMPERSONATION_COOKIE)?.value;

  if (!tokenString) {
    return null;
  }

  const validation = parseToken(tokenString);
  if (
    !validation.valid ||
    !validation.token ||
    (realAdminUserId && validation.token.realAdminUserId !== realAdminUserId)
  ) {
    // Invalid or expired token - clear it
    cookieStore.delete(IMPERSONATION_COOKIE);
    return null;
  }

  return validation.token;
}

/**
 * Check if the current session is impersonated
 */
export async function isImpersonating(): Promise<boolean> {
  const state = await getImpersonationState();
  return state !== null;
}

/**
 * Get the effective user ID for the current request
 * If impersonating, returns the target's canonical app user ID.
 * Otherwise returns null (caller should use normal auth)
 */
export async function getEffectiveUserId(): Promise<string | null> {
  const state = await getImpersonationState();
  return state?.effectiveUserId ?? null;
}

/**
 * Get the real administrator's canonical app user ID during impersonation.
 * Returns null if not impersonating
 */
export async function getRealAdminUserId(): Promise<string | null> {
  const state = await getImpersonationState();
  return state?.realAdminUserId ?? null;
}

/**
 * Get remaining time on impersonation session in milliseconds
 * Returns 0 if not impersonating
 */
export async function getImpersonationTimeRemaining(
  realAdminUserId?: string
): Promise<number> {
  const state = await getImpersonationState(realAdminUserId);
  if (!state) {
    return 0;
  }
  return Math.max(0, state.expiresAt - Date.now());
}

/**
 * Error class for impersonation-related errors
 */
export class ImpersonationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ImpersonationError';
  }
}
