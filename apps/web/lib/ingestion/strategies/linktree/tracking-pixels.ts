/**
 * Linktree Tracking Pixel Detection
 *
 * Detects creator-owned tracking pixels (Facebook, TikTok, Google, X/Twitter,
 * Snapchat, Pinterest) from Linktree profile HTML. Only init/load calls count —
 * script src presence alone does NOT count, since Linktree loads these for its
 * own analytics.
 */

import type { DiscoveredPixels } from '@/lib/db/schema/profiles';

const PIXEL_PLATFORMS = [
  'facebook',
  'tiktok',
  'google',
  'twitter',
  'snapchat',
  'pinterest',
] as const satisfies readonly (keyof DiscoveredPixels)[];

const PIXEL_DETECTORS = [
  {
    platform: 'facebook' as const,
    initPattern: /fbq\s*\(\s*['"]init['"]\s*,\s*['"](\d+)['"]/g,
  },
  {
    platform: 'tiktok' as const,
    initPattern: /ttq\.load\s*\(\s*['"]([A-Z0-9]+)['"]/g,
  },
  {
    platform: 'google' as const,
    initPattern: /gtag\s*\(\s*['"]config['"]\s*,\s*['"]([A-Z0-9-]+)['"]/g,
  },
  {
    // X (Twitter) pixel: twq('init', 'o1234') and twq('config', 'o1234')
    platform: 'twitter' as const,
    initPattern:
      /twq\s*\(\s*['"](?:init|config)['"]\s*,\s*['"]([a-z0-9]+)['"]/gi,
  },
  {
    // Snapchat pixel: snaptr('init', 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx')
    platform: 'snapchat' as const,
    initPattern: /snaptr\s*\(\s*['"]init['"]\s*,\s*['"]([0-9a-f-]+)['"]/gi,
  },
  {
    // Pinterest tag: pintrk('load', '2612345678901')
    platform: 'pinterest' as const,
    initPattern: /pintrk\s*\(\s*['"]load['"]\s*,\s*['"](\d+)['"]/g,
  },
];

/**
 * Detect tracking pixels in Linktree profile HTML.
 *
 * Scans for platform-specific init/load calls and extracts pixel IDs.
 * Script tag presence alone is ignored — only explicit init calls count.
 * Pixel IDs are deduplicated per platform: the same init call commonly appears
 * twice (inline script plus its serialized copy inside __NEXT_DATA__).
 *
 * @param html - The HTML content of the Linktree page
 * @returns Discovered pixels by platform, or null if none found
 */
export function detectTrackingPixels(html: string): DiscoveredPixels | null {
  const result: DiscoveredPixels = {};
  let found = false;

  for (const detector of PIXEL_DETECTORS) {
    // Reset regex state for each call (global flag)
    const regex = new RegExp(
      detector.initPattern.source,
      detector.initPattern.flags
    );
    const ids: string[] = [];

    let match: RegExpExecArray | null;
    while ((match = regex.exec(html)) !== null) {
      if (match[1] && !ids.includes(match[1])) {
        ids.push(match[1]);
      }
    }

    if (ids.length > 0) {
      result[detector.platform] = { detected: true, pixelIds: ids };
      found = true;
    }
  }

  return found ? result : null;
}

/**
 * Merge discovered pixels from a new ingestion with existing data.
 *
 * - If incoming is null, returns existing (weak re-ingest protection).
 * - If existing is null, returns incoming.
 * - For each platform: incoming overwrites existing; otherwise existing is kept.
 *
 * @param existing - Previously discovered pixels (may be null)
 * @param incoming - Newly discovered pixels (may be null)
 * @returns Merged pixels, or null if both are null
 */
export function mergeDiscoveredPixels(
  existing: DiscoveredPixels | null,
  incoming: DiscoveredPixels | null
): DiscoveredPixels | null {
  if (incoming === null) return existing;
  if (existing === null) return incoming;

  const merged: DiscoveredPixels = { ...existing };

  for (const platform of PIXEL_PLATFORMS) {
    if (incoming[platform]) {
      merged[platform] = incoming[platform];
    }
  }

  return merged;
}

/**
 * Filter discovered pixels to only those owned by the creator.
 *
 * Removes any pixel IDs found in the suppression set (known platform-owned IDs).
 * Returns null if all pixels are suppressed.
 *
 * @param discoveredPixels - All discovered pixels
 * @param suppressedPixelIds - Set of pixel IDs to filter out
 * @returns Creator-owned pixels only, or null if all suppressed
 */
export function getCreatorOwnedPixels(
  discoveredPixels: DiscoveredPixels,
  suppressedPixelIds: Set<string>
): DiscoveredPixels | null {
  const result: DiscoveredPixels = {};
  let found = false;

  for (const platform of PIXEL_PLATFORMS) {
    const entry = discoveredPixels[platform];
    if (!entry) continue;

    const filtered = entry.pixelIds.filter(id => !suppressedPixelIds.has(id));
    if (filtered.length > 0) {
      result[platform] = { detected: true, pixelIds: filtered };
      found = true;
    }
  }

  return found ? result : null;
}
