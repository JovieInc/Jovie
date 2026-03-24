/**
 * Tests for activeProfileId-based profile selection in getDashboardData.
 *
 * The dashboard data function now respects users.activeProfileId when selecting
 * which profile to show. This test verifies the selection logic:
 * - activeProfileId set and matches → use that profile
 * - activeProfileId set but no match → fall back to heuristic
 * - activeProfileId null → fall back to heuristic
 *
 * Regression: dual-artist-profile-switching
 * Found by /qa on 2026-03-23
 */

import { describe, expect, it } from 'vitest';
import type { CreatorProfile } from '@/lib/db/schema/profiles';
import { selectDashboardProfile } from '@/lib/db/server';

// Minimal profile factory for testing selection logic
function makeProfile(
  overrides: Partial<CreatorProfile> & { id: string }
): CreatorProfile {
  return {
    userId: 'user-1',
    creatorType: 'artist',
    username: `user-${overrides.id}`,
    usernameNormalized: `user-${overrides.id}`,
    displayName: `Profile ${overrides.id}`,
    isPublic: true,
    isClaimed: true,
    claimedAt: new Date(),
    onboardingCompletedAt: new Date(),
    settings: {},
    theme: {},
    ingestionStatus: 'idle',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as CreatorProfile;
}

/**
 * Simulates the profile selection logic from dashboard-data.ts:
 *   const selected = userData.activeProfileId
 *     ? creatorData.find(p => p.id === userData.activeProfileId) ?? selectDashboardProfile(creatorData)
 *     : selectDashboardProfile(creatorData);
 */
function selectWithActiveProfileId(
  profiles: CreatorProfile[],
  activeProfileId: string | null
): CreatorProfile {
  if (activeProfileId) {
    const found = profiles.find(p => p.id === activeProfileId);
    if (found) return found;
  }
  return selectDashboardProfile(profiles);
}

describe('activeProfileId-based profile selection', () => {
  const profileA = makeProfile({ id: 'profile-a', displayName: 'Tim' });
  const profileB = makeProfile({ id: 'profile-b', displayName: 'Jovie' });
  const profiles = [profileA, profileB];

  it('selects the profile matching activeProfileId', () => {
    const selected = selectWithActiveProfileId(profiles, 'profile-b');
    expect(selected.id).toBe('profile-b');
    expect(selected.displayName).toBe('Jovie');
  });

  it('falls back to heuristic when activeProfileId does not match any profile', () => {
    const selected = selectWithActiveProfileId(profiles, 'deleted-profile');
    // selectDashboardProfile picks the first claimed+publishable profile
    expect(selected.id).toBe('profile-a');
  });

  it('falls back to heuristic when activeProfileId is null', () => {
    const selected = selectWithActiveProfileId(profiles, null);
    expect(selected.id).toBe('profile-a');
  });

  it('respects activeProfileId even when heuristic would pick differently', () => {
    // profileB is less recently updated, but activeProfileId points to it
    const olderB = makeProfile({
      id: 'profile-b',
      displayName: 'Jovie',
      updatedAt: new Date('2020-01-01'),
    });
    const selected = selectWithActiveProfileId([profileA, olderB], 'profile-b');
    expect(selected.id).toBe('profile-b');
  });
});
