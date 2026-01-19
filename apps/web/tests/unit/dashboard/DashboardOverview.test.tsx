import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DashboardOverview } from '@/components/dashboard/organisms/DashboardOverview';
import type { CreatorProfile as DrizzleCreatorProfile } from '@/lib/db/schema';
import { convertDrizzleCreatorProfileToArtist } from '@/types/db';

function makeProfile(
  partial: Partial<DrizzleCreatorProfile> = {}
): DrizzleCreatorProfile {
  const now = new Date();
  return {
    id: 'profile-1',
    userId: null,
    creatorType: 'artist',
    username: 'artist1',
    usernameNormalized: 'artist1',
    displayName: null,
    avatarLockedByUser: false,
    displayNameLocked: false,
    ingestionStatus: 'idle',
    bio: null,
    avatarUrl: null,
    spotifyUrl: null,
    appleMusicUrl: null,
    youtubeUrl: null,
    spotifyId: null,
    isPublic: true,
    isVerified: false,
    isFeatured: false,
    marketingOptOut: false,
    isClaimed: false,
    claimToken: null,
    claimedAt: null,
    lastLoginAt: null,
    profileViews: 0,
    onboardingCompletedAt: null,
    settings: {},
    theme: {},
    createdAt: now,
    updatedAt: now,
    ...partial,
  } as DrizzleCreatorProfile;
}

function renderDashboard(
  profile: DrizzleCreatorProfile,
  hasSocialLinks = false
) {
  const artist = convertDrizzleCreatorProfileToArtist(profile);
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <DashboardOverview artist={artist} hasSocialLinks={hasSocialLinks} />
    </QueryClientProvider>
  );
}

describe('DashboardOverview', () => {
  afterEach(() => {
    vi.useRealTimers();
    // Reset clipboard mock between tests
    (navigator as any).clipboard = undefined;
  });

  it('renders setup tasks when incomplete', () => {
    const profile = makeProfile({ userId: null });

    renderDashboard(profile, false);

    expect(screen.getByText('Complete your setup')).toBeInTheDocument();

    // Task titles (use regex to ignore numeric prefixes like "1. ").
    // Some labels may appear both as list text and as button text; allow multiple.
    expect(screen.getByText(/Claim your handle/i)).toBeInTheDocument();
    expect(screen.getByText(/Add a music link/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Add social links/i).length).toBeGreaterThan(0);

    // CTA links for incomplete items (shown as "Claim →" and "Add →")
    expect(screen.getByRole('link', { name: /Claim →/i })).toBeInTheDocument();
    // Multiple "Add →" links for music and social
    expect(screen.getAllByRole('link', { name: /Add →/i }).length).toBe(2);

    // Progress indicator text
    expect(screen.getByText('0 of 3 complete')).toBeInTheDocument();
  });

  it('marks tasks complete based on data', () => {
    const profile = makeProfile({
      userId: 'db-user-123',
      spotifyUrl: 'https://open.spotify.com/artist/123',
    });
    renderDashboard(profile, false);

    expect(screen.getByText('Complete your setup')).toBeInTheDocument();

    // Task labels are the same regardless of completion state;
    // completion is indicated visually via checkmarks and styling
    expect(screen.getByText('Claim your handle')).toBeInTheDocument();
    expect(screen.getByText('Add a music link')).toBeInTheDocument();
    expect(screen.getByText('Add social links')).toBeInTheDocument();

    // Completed tasks should NOT have CTA links (Claim →)
    expect(
      screen.queryByRole('link', { name: /Claim →/i })
    ).not.toBeInTheDocument();

    // Only the "Add →" link for social links should be present (incomplete task)
    expect(screen.getByRole('link', { name: /Add →/i })).toBeInTheDocument();

    // Progress indicator reflects 2/3
    expect(screen.getByText('2 of 3 complete')).toBeInTheDocument();
  });

  it('supports copy-to-clipboard with aria-live status', async () => {
    vi.useFakeTimers();

    const writeText = vi.fn().mockResolvedValue(undefined);
    (navigator as any).clipboard = { writeText };

    const profile = makeProfile({
      userId: 'db-user-123',
      spotifyUrl: 'https://open.spotify.com/artist/123',
    });
    renderDashboard(profile, true);

    // Copy flow - header copy control is icon-only (sr-only label)
    const headerEl = screen
      .getByText('Keep your profile polished and ready to share.')
      .closest('header');
    expect(headerEl).not.toBeNull();
    const copyBtn = within(headerEl as HTMLElement).getByRole('button', {
      name: 'Copy URL',
    });
    fireEvent.click(copyBtn);

    // Clipboard called with computed profile URL
    expect(writeText).toHaveBeenCalledTimes(1);
    const expectedBase = window.location.origin;
    expect(writeText.mock.calls[0][0]).toBe(`${expectedBase}/artist1`);

    // Wait for the async clipboard write to resolve so the component can update state
    const copyPromise = writeText.mock.results[0]?.value as Promise<void>;
    if (copyPromise) {
      await copyPromise;
    }
    // Allow React state update microtask to flush
    await Promise.resolve();

    // Status updates to success and aria-live announces it (at least one button shows Copied!)
    const copiedBtns = screen.getAllByRole('button', { name: /Copied!/i });
    expect(copiedBtns.length).toBeGreaterThanOrEqual(1);

    // At least one status element should announce the copy
    const statuses = screen.getAllByRole('status');
    const hasAnnouncement = statuses.some(s =>
      s.textContent?.includes('Profile URL copied to clipboard')
    );
    expect(hasAnnouncement).toBe(true);

    // After timer elapses, reset back to idle
    vi.advanceTimersByTime(2000);
    // Flush microtask to reflect state reset
    await Promise.resolve();
    expect(
      within(headerEl as HTMLElement).getByRole('button', { name: 'Copy URL' })
    ).toBeInTheDocument();
  });
});
