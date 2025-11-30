import { cleanup, fireEvent, render, screen } from '@testing-library/react';
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
  return render(
    <DashboardOverview artist={artist} hasSocialLinks={hasSocialLinks} />
  );
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

    renderDashboard(profile, false);

    expect(screen.getByText('Complete Your Setup')).toBeInTheDocument();

    // Task titles (use regex to ignore numeric prefixes like "1. ").
    // Some labels may appear both as list text and as button text; allow multiple.
    expect(screen.getByText(/Set up your profile basics/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Add a music link/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Add social links/i).length).toBeGreaterThan(0);

    // CTA links (styled buttons) for incomplete items.
    // In this scenario profile basics are already complete, so we only
    // expect CTAs for music and social links.
    const musicCtas = screen.getAllByRole('link', {
      name: /Add music link/i,
    });
    expect(musicCtas.length).toBeGreaterThan(0);

    const socialLinksCtas = screen.getAllByRole('link', {
      name: /Add social links/i,
    });
    expect(socialLinksCtas.length).toBeGreaterThan(0);

    // Progress indicator (profile basics count as completed when username exists)
    expect(
      screen.getByLabelText('Setup progress: 1 of 3 steps completed')
    ).toBeInTheDocument();
  });

  it('marks tasks complete based on data', () => {
    const profile = makeProfile({
      userId: 'db-user-123',
      spotifyUrl: 'https://open.spotify.com/artist/123',
    });
    renderDashboard(profile, false);

    expect(screen.getByText('Complete Your Setup')).toBeInTheDocument();

    // Completed labels for first two tasks
    expect(screen.getByText('Profile basics saved')).toBeInTheDocument();
    expect(screen.getByText('Music link added')).toBeInTheDocument();

    // Third task still incomplete
    expect(
      screen.getByText('Connect Instagram, TikTok, Twitter, etc.')
    ).toBeInTheDocument();

    // CTA link for remaining social links (may appear in multiple places)
    const remainingSocialLinksCtas = screen.getAllByRole('link', {
      name: /Add social links/i,
    });
    expect(remainingSocialLinksCtas.length).toBeGreaterThan(0);

    // Progress indicator reflects 2/3
    expect(
      screen.getByLabelText('Setup progress: 2 of 3 steps completed')
    ).toBeInTheDocument();

    // Next-step card should point to remaining social links action
    expect(screen.getByText('Next step')).toBeInTheDocument();
    expect(screen.getByText(/Add your social links/i)).toBeInTheDocument();
  });

  it('shows completion banner and supports copy-to-clipboard with aria-live status', async () => {
    vi.useFakeTimers();

    const writeText = vi.fn().mockResolvedValue(undefined);
    (navigator as any).clipboard = { writeText };

    const profile = makeProfile({
      userId: 'db-user-123',
      spotifyUrl: 'https://open.spotify.com/artist/123',
    });
    renderDashboard(profile, true);

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
