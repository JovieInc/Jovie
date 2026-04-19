import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetOptionalAuth, mockGetDashboardData } = vi.hoisted(() => ({
  mockGetOptionalAuth: vi.fn(),
  mockGetDashboardData: vi.fn(),
}));

vi.mock('@/lib/auth/cached', () => ({
  getOptionalAuth: mockGetOptionalAuth,
}));

vi.mock('@/app/app/(shell)/dashboard/actions', () => ({
  getDashboardData: mockGetDashboardData,
}));

vi.mock('@/lib/db', () => ({
  db: {},
}));

vi.mock('@/lib/db/schema/content', () => ({
  artists: {},
  discogReleases: {},
  releaseArtists: {},
}));

vi.mock('@/lib/db/schema/profiles', () => ({
  creatorProfiles: {},
}));

vi.mock('@/app/[username]/[slug]/_lib/data', () => ({
  groupReleaseCredits: vi.fn(),
}));

import { fetchReleaseCreditsAction } from '@/components/organisms/release-sidebar/release-credits-action';

describe('fetchReleaseCreditsAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns no credits when auth is unavailable', async () => {
    // Regression: ISSUE-001 - release credits fetch threw 500s when Clerk middleware
    // was unavailable in demo and dashboard QA flows.
    // Found by /qa on 2026-04-16
    // Report: .gstack/qa-reports/qa-report-localhost-2026-04-16.md
    mockGetOptionalAuth.mockResolvedValue({
      userId: null,
      sessionId: null,
      orgId: null,
    });

    await expect(fetchReleaseCreditsAction('release_123')).resolves.toEqual([]);
    expect(mockGetDashboardData).not.toHaveBeenCalled();
  });
});
