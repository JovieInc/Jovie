import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import { creatorProfiles, db } from '@/lib/db';
import { incrementProfileViews } from '@/lib/db/queries';

/**
 * Integration test to verify that profile view increments work under RLS
 * for public profiles (e.g., /[username] pages like /taylorswift).
 *
 * This relies on:
 * - DATABASE_URL being configured, and
 * - At least one public profile with username_normalized = 'taylorswift'.
 */
describe('Public profile views', () => {
  it('increments profileViews for a public profile under RLS', async () => {
    if (!process.env.DATABASE_URL) {
      // Align with other DB tests: gracefully skip when no database is configured
      return;
    }

    const [profile] = await db
      .select()
      .from(creatorProfiles)
      .where(eq(creatorProfiles.usernameNormalized, 'taylorswift'))
      .limit(1);

    if (!profile || !profile.isPublic) {
      // Skip if the expected seeded profile is not present or not public
      // (e.g., local dev DB without seed data)
       
      console.warn(
        'Skipping public profile views test: taylorswift profile not found or not public'
      );
      return;
    }

    const beforeViews = profile.profileViews ?? 0;

    await incrementProfileViews('taylorswift');

    const [updated] = await db
      .select()
      .from(creatorProfiles)
      .where(eq(creatorProfiles.id, profile.id))
      .limit(1);

    expect(updated).toBeDefined();
    expect(updated?.profileViews).toBeGreaterThanOrEqual(beforeViews + 1);
  });
});
