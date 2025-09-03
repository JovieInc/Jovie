import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DashboardData } from '@/app/dashboard/actions';
import { DashboardOverview } from '@/components/dashboard/organisms/DashboardOverview';
import type { CreatorProfile as DrizzleCreatorProfile } from '@/lib/db/schema';

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

function makeData(
  profile: DrizzleCreatorProfile,
  overrides: Partial<DashboardData> = {}
): DashboardData {
  return {
    user: { id: 'db-user-1' },
    creatorProfiles: [profile],
    selectedProfile: profile,
    needsOnboarding: false,
    sidebarCollapsed: false,
    hasSocialLinks: false,
    ...overrides,
  } satisfies DashboardData;
}

describe('DashboardOverview', () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    // Reset clipboard mock between tests
    (navigator as any).clipboard = undefined;
  });

  it('renders setup tasks when incomplete', () => {
    const profile = makeProfile({ userId: null });
    const data = makeData(profile, { hasSocialLinks: false });

    render(<DashboardOverview initialData={data} />);

    expect(screen.getByText('Complete Your Setup')).toBeInTheDocument();

    // Task titles (use regex to ignore numeric prefixes like "1. ")
    expect(screen.getByText(/Claim your handle/i)).toBeInTheDocument();
    expect(screen.getByText(/Add a music link/i)).toBeInTheDocument();
    expect(screen.getByText(/Add social links/i)).toBeInTheDocument();

    // CTA links for incomplete items - these are Link components, not buttons
    expect(screen.getByText('Complete →')).toBeInTheDocument();
    expect(screen.getAllByText('Add →')).toHaveLength(2); // Two "Add →" links for music and social
  });

  it('marks tasks complete based on data', () => {
    const profile = makeProfile({
      userId: 'db-user-123',
      spotifyUrl: 'https://open.spotify.com/artist/123',
    });
    const data = makeData(profile, { hasSocialLinks: false });

    render(<DashboardOverview initialData={data} />);

    expect(screen.getByText('Complete Your Setup')).toBeInTheDocument();

    // Completed labels for first two tasks
    expect(screen.getByText('Handle claimed')).toBeInTheDocument();
    expect(screen.getByText('Music link added')).toBeInTheDocument();

    // Third task still incomplete
    expect(
      screen.getByText('Connect Instagram, TikTok, Twitter, etc.')
    ).toBeInTheDocument();

    // One remaining "Add →" link for social links
    expect(screen.getByText('Add →')).toBeInTheDocument();
  });

  it('shows completion banner and supports copy-to-clipboard with aria-live status', async () => {
    vi.useFakeTimers();

    const writeText = vi.fn().mockResolvedValue(undefined);
    (navigator as any).clipboard = { writeText };

    const profile = makeProfile({
      userId: 'db-user-123',
      spotifyUrl: 'https://open.spotify.com/artist/123',
    });
    const data = makeData(profile, { hasSocialLinks: true });

    render(<DashboardOverview initialData={data} />);

    // Completion UI
    expect(screen.getByText('Profile Ready!')).toBeInTheDocument();
    expect(screen.getByText('Your profile is ready!')).toBeInTheDocument();

    // Copy flow
    const copyBtn = screen.getByRole('button', { name: 'Copy URL' });
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

    // Status updates to success and aria-live announces it
    expect(
      screen.getByRole('button', { name: /Copied!/i })
    ).toBeInTheDocument();

    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('Profile URL copied to clipboard');

    // After timer elapses, reset back to idle
    vi.advanceTimersByTime(2000);
    // Flush microtask to reflect state reset
    await Promise.resolve();
    expect(
      screen.getByRole('button', { name: 'Copy URL' })
    ).toBeInTheDocument();
  });
});
