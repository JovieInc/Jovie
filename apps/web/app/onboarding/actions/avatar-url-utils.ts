/**
 * Avatar URL validation utilities.
 *
 * Extracted from avatar.ts because 'use server' modules require all exports
 * to be async functions — these are pure synchronous helpers.
 */

import { publicEnv } from '@/lib/env-public';

/** Known Vercel project prefixes for this workspace. */
const VERCEL_PROJECT_PREFIXES = ['jovie-', 'shouldimake-'] as const;

/** OAuth provider hostnames that serve user avatar images. */
const OAUTH_AVATAR_HOSTNAMES = [
  'lh3.googleusercontent.com', // Google
  'platform-lookaside.fbsbx.com', // Facebook
  'avatars.githubusercontent.com', // GitHub
  'img.clerk.com', // Clerk
  'images.clerk.dev', // Clerk (legacy)
  'gravatar.com', // Gravatar
  'www.gravatar.com', // Gravatar
  'cdn.discordapp.com', // Discord
] as const;

/**
 * Builds the set of allowed hostnames for avatar uploads.
 * Includes:
 * - localhost for development
 * - The hostname from NEXT_PUBLIC_APP_URL (e.g., jov.ie)
 * - The normalized NEXT_PUBLIC_PROFILE_HOSTNAME
 * - Known OAuth provider hostnames (Google, GitHub, Clerk, etc.)
 */
export function buildAllowedHostnames(): Set<string> {
  const allowed = new Set<string>(['localhost', ...OAUTH_AVATAR_HOSTNAMES]);

  // Add hostname from NEXT_PUBLIC_APP_URL
  const appUrl = publicEnv.NEXT_PUBLIC_APP_URL;
  if (appUrl) {
    try {
      const parsed = new URL(appUrl);
      allowed.add(parsed.hostname);
    } catch {
      // Invalid URL, skip
    }
  }

  // Add NEXT_PUBLIC_PROFILE_HOSTNAME — normalize in case it includes protocol/port
  const profileHostname = publicEnv.NEXT_PUBLIC_PROFILE_HOSTNAME;
  if (profileHostname) {
    try {
      const parsed = new URL(`https://${profileHostname}`);
      allowed.add(parsed.hostname);
    } catch {
      // Already a bare hostname — use as-is
      allowed.add(profileHostname);
    }
  }

  return allowed;
}

/**
 * Validates and normalizes the remote avatar image URL to prevent SSRF.
 * Only allows HTTP(S) URLs whose hostnames are in the allowed set.
 */
export function getSafeImageUrl(imageUrl: string): string {
  let url: URL;
  try {
    url = new URL(imageUrl);
  } catch {
    throw new TypeError('Invalid avatar image URL');
  }

  // Only allow HTTP(S) schemes
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new TypeError('Invalid avatar image URL protocol');
  }

  const allowedHostnames = buildAllowedHostnames();
  if (!allowedHostnames.has(url.hostname)) {
    throw new TypeError('Avatar image host is not allowed');
  }

  return url.toString();
}

/**
 * Checks if a hostname is a known Vercel preview deployment for this project.
 * Only matches our specific project prefixes, not arbitrary .vercel.app domains.
 */
export function isVercelPreviewHostname(hostname: string): boolean {
  if (!hostname.endsWith('.vercel.app')) return false;
  return VERCEL_PROJECT_PREFIXES.some(prefix => hostname.startsWith(prefix));
}

/**
 * Returns a safe upload URL for the internal images API.
 * Uses NEXT_PUBLIC_APP_URL as a trusted origin instead of request headers.
 */
export function getSafeUploadUrl(): string {
  const baseUrl = publicEnv.NEXT_PUBLIC_APP_URL;
  let parsed: URL;
  try {
    parsed = new URL(baseUrl);
  } catch {
    throw new TypeError('Invalid base URL for avatar upload');
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new TypeError('Unsupported protocol for avatar upload URL');
  }

  const allowedHostnames = buildAllowedHostnames();
  const isAllowed =
    allowedHostnames.has(parsed.hostname) ||
    isVercelPreviewHostname(parsed.hostname);

  if (!isAllowed) {
    throw new TypeError('Untrusted host for avatar upload URL');
  }

  const uploadUrl = new URL('/api/images/upload', parsed.origin);
  return uploadUrl.toString();
}
