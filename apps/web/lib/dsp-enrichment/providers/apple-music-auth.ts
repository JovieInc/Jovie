/**
 * Apple MusicKit JWT Authentication
 *
 * Generates developer tokens for Apple MusicKit API.
 * Uses ES256 algorithm with Apple-provided private key.
 *
 * Required environment variables:
 * - APPLE_MUSIC_KEY_ID: The 10-character key identifier
 * - APPLE_MUSIC_TEAM_ID: The 10-character Apple Developer team ID
 * - APPLE_MUSIC_PRIVATE_KEY: The .p8 private key contents (PEM format)
 *
 * @see https://developer.apple.com/documentation/applemusicapi/generating_developer_tokens
 */

import 'server-only';

import { importPKCS8, SignJWT } from 'jose';

// ============================================================================
// Configuration
// ============================================================================

const APPLE_MUSIC_KEY_ID = process.env.APPLE_MUSIC_KEY_ID;
const APPLE_MUSIC_TEAM_ID = process.env.APPLE_MUSIC_TEAM_ID;
const APPLE_MUSIC_PRIVATE_KEY = process.env.APPLE_MUSIC_PRIVATE_KEY;

// ============================================================================
// Environment Validation (run once at module load)
// ============================================================================

/**
 * Regex for Apple Key ID and Team ID (10 alphanumeric characters).
 * Accepts both uppercase and lowercase letters.
 */
const APPLE_ID_REGEX = /^[A-Za-z0-9]{10}$/;

/**
 * Validate that environment variables have correct format.
 * Called once at module initialization to catch configuration errors early.
 *
 * @throws Error if any configured value has invalid format
 */
function validateEnvFormat(): void {
  // Only validate if credentials are configured
  if (!APPLE_MUSIC_KEY_ID && !APPLE_MUSIC_TEAM_ID && !APPLE_MUSIC_PRIVATE_KEY) {
    return; // Not configured - skip validation
  }

  if (APPLE_MUSIC_KEY_ID && !APPLE_ID_REGEX.test(APPLE_MUSIC_KEY_ID)) {
    throw new Error(
      `Invalid APPLE_MUSIC_KEY_ID format: expected 10 alphanumeric characters, got "${APPLE_MUSIC_KEY_ID.slice(0, 20)}${APPLE_MUSIC_KEY_ID.length > 20 ? '...' : ''}"`
    );
  }

  if (APPLE_MUSIC_TEAM_ID && !APPLE_ID_REGEX.test(APPLE_MUSIC_TEAM_ID)) {
    throw new Error(
      `Invalid APPLE_MUSIC_TEAM_ID format: expected 10 alphanumeric characters, got "${APPLE_MUSIC_TEAM_ID.slice(0, 20)}${APPLE_MUSIC_TEAM_ID.length > 20 ? '...' : ''}"`
    );
  }

  if (APPLE_MUSIC_PRIVATE_KEY) {
    const normalizedKey = APPLE_MUSIC_PRIVATE_KEY.replace(/\\n/g, '\n');
    const hasPemHeader = normalizedKey.includes('-----BEGIN');
    const hasPemFooter = normalizedKey.includes('-----END');

    if (!hasPemHeader || !hasPemFooter) {
      throw new Error(
        'Invalid APPLE_MUSIC_PRIVATE_KEY format: expected PEM format with BEGIN/END markers'
      );
    }
  }
}

// Validate environment format once at module load
validateEnvFormat();

/**
 * Token validity period in seconds.
 * Apple recommends max 6 months (15777000 seconds).
 * We use 1 day for security.
 */
const TOKEN_EXPIRY_SECONDS = 86400; // 24 hours

/**
 * Buffer before expiry to trigger refresh (5 minutes)
 */
const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000;

// ============================================================================
// Token Cache
// ============================================================================

interface CachedToken {
  token: string;
  expiresAt: number;
}

let cachedToken: CachedToken | null = null;

// ============================================================================
// JWT Generation
// ============================================================================

/**
 * Generate a fresh Apple MusicKit developer token.
 *
 * @returns The signed JWT token
 * @throws Error if environment variables are not configured
 */
async function generateToken(): Promise<string> {
  if (!APPLE_MUSIC_KEY_ID) {
    throw new Error('APPLE_MUSIC_KEY_ID environment variable is not set');
  }
  if (!APPLE_MUSIC_TEAM_ID) {
    throw new Error('APPLE_MUSIC_TEAM_ID environment variable is not set');
  }
  if (!APPLE_MUSIC_PRIVATE_KEY) {
    throw new Error('APPLE_MUSIC_PRIVATE_KEY environment variable is not set');
  }

  // The private key may be stored with escaped newlines
  const privateKeyPem = APPLE_MUSIC_PRIVATE_KEY.replace(/\\n/g, '\n');

  // Import the private key for ES256 signing
  const privateKey = await importPKCS8(privateKeyPem, 'ES256');

  const now = Math.floor(Date.now() / 1000);

  const token = await new SignJWT({})
    .setProtectedHeader({
      alg: 'ES256',
      kid: APPLE_MUSIC_KEY_ID,
    })
    .setIssuer(APPLE_MUSIC_TEAM_ID)
    .setIssuedAt(now)
    .setExpirationTime(now + TOKEN_EXPIRY_SECONDS)
    .sign(privateKey);

  return token;
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Get a valid Apple MusicKit developer token.
 *
 * Returns a cached token if still valid, otherwise generates a new one.
 * Thread-safe through single-threaded Node.js execution.
 *
 * @returns The developer token for MusicKit API requests
 * @throws Error if configuration is missing
 */
export async function getAppleMusicToken(): Promise<string> {
  const now = Date.now();

  // Return cached token if still valid (with buffer)
  if (cachedToken && cachedToken.expiresAt - TOKEN_REFRESH_BUFFER_MS > now) {
    return cachedToken.token;
  }

  // Generate new token
  const token = await generateToken();
  const expiresAt = now + TOKEN_EXPIRY_SECONDS * 1000;

  cachedToken = { token, expiresAt };

  console.log('[Apple Music Auth] Generated new developer token', {
    expiresAt: new Date(expiresAt).toISOString(),
  });

  return token;
}

/**
 * Check if Apple Music credentials are configured.
 *
 * @returns True if all required environment variables are set
 */
export function isAppleMusicConfigured(): boolean {
  return Boolean(
    APPLE_MUSIC_KEY_ID && APPLE_MUSIC_TEAM_ID && APPLE_MUSIC_PRIVATE_KEY
  );
}

/**
 * Clear the cached token.
 * Useful for testing or when token is rejected.
 */
export function clearAppleMusicTokenCache(): void {
  cachedToken = null;
}

/**
 * Get authorization headers for Apple MusicKit API requests.
 *
 * @returns Headers object with Authorization
 */
export async function getAppleMusicAuthHeaders(): Promise<{
  Authorization: string;
}> {
  const token = await getAppleMusicToken();
  return {
    Authorization: `Bearer ${token}`,
  };
}
