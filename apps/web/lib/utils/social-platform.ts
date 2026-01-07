/**
 * Social platform utility functions for waitlist and onboarding flows.
 *
 * This module consolidates platform detection and handle extraction logic
 * that was previously duplicated across waitlist submission and admin approval routes.
 */

import { normalizeUrl } from './platform-detection';

export interface PlatformDetectionResult {
  platform: string;
  normalizedUrl: string;
}

/**
 * Detect social media platform from a URL.
 *
 * This function identifies which social media platform a URL belongs to
 * and returns both the platform name and normalized URL.
 *
 * Supported platforms:
 * - Instagram
 * - TikTok
 * - YouTube
 * - X (Twitter)
 * - Twitch
 * - Linktree
 * - Facebook
 * - Threads
 * - Snapchat
 *
 * @param url - Social media profile URL
 * @returns Object containing platform name and normalized URL
 *
 * @example
 * detectPlatformFromUrl('https://instagram.com/user')
 * // returns { platform: 'instagram', normalizedUrl: '...' }
 */
export function detectPlatformFromUrl(url: string): PlatformDetectionResult {
  const normalizedUrl = normalizeUrl(url);

  const platformPatterns: Array<{ pattern: RegExp; platform: string }> = [
    { pattern: /(?:www\.)?instagram\.com/i, platform: 'instagram' },
    { pattern: /(?:www\.)?tiktok\.com/i, platform: 'tiktok' },
    { pattern: /(?:www\.)?youtube\.com|youtu\.be/i, platform: 'youtube' },
    { pattern: /(?:twitter\.com|x\.com)/i, platform: 'x' },
    { pattern: /(?:www\.)?twitch\.tv/i, platform: 'twitch' },
    { pattern: /(?:linktr\.ee|linktree\.com)/i, platform: 'linktree' },
    { pattern: /(?:www\.)?facebook\.com/i, platform: 'facebook' },
    { pattern: /(?:www\.)?threads\.net/i, platform: 'threads' },
    { pattern: /(?:www\.)?snapchat\.com/i, platform: 'snapchat' },
  ];

  for (const { pattern, platform } of platformPatterns) {
    if (pattern.test(normalizedUrl)) {
      return { platform, normalizedUrl };
    }
  }

  return { platform: 'unknown', normalizedUrl };
}

/**
 * Extract username/handle from a social media URL.
 *
 * This function attempts to parse a social media URL and extract the username
 * or handle. Different platforms have different URL structures, so this function
 * handles the most common patterns for each platform.
 *
 * Extraction patterns:
 * - Instagram: instagram.com/username → username
 * - TikTok: tiktok.com/@username → username
 * - YouTube: youtube.com/@channel → channel
 * - Linktree: linktr.ee/username → username
 *
 * @param urlRaw - Raw social media profile URL
 * @returns Extracted handle/username, or null if unable to extract
 *
 * @example
 * extractHandleFromUrl('https://instagram.com/@testuser')
 * // returns 'testuser'
 *
 * extractHandleFromUrl('https://youtube.com/@channelname')
 * // returns 'channelname'
 */
export function extractHandleFromUrl(urlRaw: string): string | null {
  try {
    const url = new URL(urlRaw);
    const host = url.hostname.toLowerCase();

    // Define allowed hosts for each platform (include common subdomains)
    const INSTAGRAM_HOSTS = ['instagram.com', 'www.instagram.com'];
    const TIKTOK_HOSTS = ['tiktok.com', 'www.tiktok.com'];
    const YOUTUBE_HOSTS = ['youtube.com', 'www.youtube.com', 'm.youtube.com'];
    const LINKTREE_HOSTS = ['linktr.ee', 'www.linktr.ee'];

    // Instagram: instagram.com/username
    if (INSTAGRAM_HOSTS.includes(host)) {
      const seg = url.pathname.split('/').filter(Boolean)[0];
      return seg ? seg.replace(/^@/, '') : null;
    }

    // TikTok: tiktok.com/@username
    if (TIKTOK_HOSTS.includes(host)) {
      const seg = url.pathname.split('/').filter(Boolean)[0];
      return seg ? seg.replace(/^@/, '') : null;
    }

    // YouTube: youtube.com/@channelname
    if (YOUTUBE_HOSTS.includes(host)) {
      const seg = url.pathname.split('/').filter(Boolean)[0];
      if (!seg) return null;

      // YouTube handles must start with @
      if (seg.startsWith('@')) return seg.slice(1);
      return null;
    }

    // Linktree: linktr.ee/username
    if (LINKTREE_HOSTS.includes(host)) {
      const seg = url.pathname.split('/').filter(Boolean)[0];
      return seg ? seg.replace(/^@/, '') : null;
    }

    // Unsupported platform or unable to extract
    return null;
  } catch {
    // Invalid URL
    return null;
  }
}
