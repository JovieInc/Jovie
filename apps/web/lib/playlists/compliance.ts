/**
 * Spotify TOS Compliance Layer
 *
 * Ensures playlist creation patterns look organic, not bot-like.
 * Randomizes cadence, varies playlist sizes, and adds behavioral signals.
 */

import 'server-only';
import { count, gte } from 'drizzle-orm';
import { db } from '@/lib/db';
import { joviePlaylists } from '@/lib/db/schema/playlists';

// ============================================================================
// Configuration
// ============================================================================

/** Min/max playlists to create per day (randomized) */
const MAX_PER_DAY = 2;

/** Min/max tracks per playlist (varied to look organic) */
const MIN_TRACKS = 20;
const MAX_TRACKS = 40;

// ============================================================================
// Cadence Control
// ============================================================================

/**
 * Determine whether to generate a playlist right now.
 * Uses randomization so we don't create exactly 1 playlist every day at the same time.
 * Returns true if we should generate, false to skip this run.
 */
export async function shouldGenerateToday(): Promise<boolean> {
  // Count how many playlists we've created today
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);

  const [result] = await db
    .select({ count: count() })
    .from(joviePlaylists)
    .where(gte(joviePlaylists.createdAt, todayStart));

  const todayCount = result?.count ?? 0;

  // Already hit max for today
  if (todayCount >= MAX_PER_DAY) return false;

  // Random chance based on remaining budget
  // If we haven't created any today, 80% chance
  // If we created 1, 30% chance of a second
  if (todayCount === 0) return Math.random() < 0.8;
  return Math.random() < 0.3;
}

// ============================================================================
// Size Variation
// ============================================================================

/**
 * Get a randomized target playlist size.
 * Varies between 20-40 tracks to look organic.
 */
export function getTargetPlaylistSize(): number {
  return MIN_TRACKS + Math.floor(Math.random() * (MAX_TRACKS - MIN_TRACKS + 1));
}

// ============================================================================
// Slug Generation
// ============================================================================

/**
 * Generate a URL-safe slug from a playlist title.
 * Appends a short date suffix for uniqueness.
 */
export function generatePlaylistSlug(title: string): string {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);

  // Add MMDD suffix for uniqueness
  const now = new Date();
  const suffix = `${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;

  return `${base}-${suffix}`;
}
