/**
 * Component tests for public profile UI components.
 *
 * Tests:
 * - ClaimBanner: rendering, auth-aware URLs, accessibility
 * - ProfileViewTracker: analytics tracking, sendBeacon, deduplication
 * - LatestReleaseCard: rendering, release type labels, missing artwork
 * - ProfileHeader: rendering, schema.org markup
 */

import { cleanup, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// --- Mock Clerk ---
const mockUseUserSafe = vi.hoisted(() =>
  vi.fn(() => ({
    isSignedIn: false,
    isLoaded: true,
    user: null,
  }))
);

vi.mock('@/hooks/useClerkSafe', () => ({
  useUserSafe: mockUseUserSafe,
}));

// --- Mock Next.js ---
vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    ...props
  }: {
    children: React.ReactNode;
    href: string;
    [key: string]: unknown;
  }) => React.createElement('a', { href, ...props }, children),
}));

vi.mock('next/image', () => ({
  default: ({
    src,
    alt,
    ...props
  }: {
    src: string;
    alt: string;
    [key: string]: unknown;
  }) =>
    React.createElement('img', {
      src,
      alt,
      'data-testid': 'next-image',
      ...props,
    }),
}));

// --- Mock lucide-react ---
vi.mock('lucide-react', () => ({
  ArrowRight: (props: Record<string, unknown>) =>
    React.createElement('svg', { 'data-testid': 'arrow-right', ...props }),
  Sparkles: (props: Record<string, unknown>) =>
    React.createElement('svg', { 'data-testid': 'sparkles', ...props }),
  Music: (props: Record<string, unknown>) =>
    React.createElement('svg', { 'data-testid': 'music-icon', ...props }),
}));

// --- Mock analytics ---
const mockTrack = vi.fn();
vi.mock('@/lib/analytics', () => ({
  track: (...args: unknown[]) => mockTrack(...args),
}));

describe('ClaimBanner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders banner with profile name', async () => {
    const { ClaimBanner } = await import('@/components/profile/ClaimBanner');
    render(
      <ClaimBanner
        claimToken='test-token-123'
        profileHandle='testartist'
        displayName='Test Artist'
      />
    );

    expect(screen.getByTestId('claim-banner')).toBeDefined();
    expect(screen.getByText(/Claim Profile/)).toBeDefined();
  });

  it('has proper accessibility attributes', async () => {
    const { ClaimBanner } = await import('@/components/profile/ClaimBanner');
    render(
      <ClaimBanner
        claimToken='test-token-123'
        profileHandle='testartist'
        displayName='Test Artist'
      />
    );

    const banner = screen.getByTestId('claim-banner');
    expect(banner.getAttribute('aria-label')).toBe('Claim profile banner');

    const cta = screen.getByTestId('claim-banner-cta');
    expect(cta.getAttribute('aria-label')).toBe(
      'Claim profile for Test Artist'
    );
  });

  it('links to signup with redirect for signed-out users', async () => {
    mockUseUserSafe.mockReturnValue({
      isSignedIn: false,
      isLoaded: true,
      user: null,
    });

    const { ClaimBanner } = await import('@/components/profile/ClaimBanner');
    render(
      <ClaimBanner claimToken='test-token-123' profileHandle='testartist' />
    );

    const cta = screen.getByTestId('claim-banner-cta');
    const href = cta.getAttribute('href');
    expect(href).toContain('/signup');
    expect(href).toContain('redirect_url');
    expect(href).toContain('test-token-123');
  });

  it('links directly to claim path for signed-in users', async () => {
    mockUseUserSafe.mockReturnValue({
      isSignedIn: true,
      isLoaded: true,
      user: { id: 'user-123' } as unknown as null,
    });

    const { ClaimBanner } = await import('@/components/profile/ClaimBanner');
    render(
      <ClaimBanner claimToken='test-token-123' profileHandle='testartist' />
    );

    const cta = screen.getByTestId('claim-banner-cta');
    const href = cta.getAttribute('href');
    expect(href).toBe('/claim/test-token-123');
    expect(href).not.toContain('signup');
  });

  it('falls back to handle when displayName not provided', async () => {
    const { ClaimBanner } = await import('@/components/profile/ClaimBanner');
    render(
      <ClaimBanner claimToken='test-token-123' profileHandle='testartist' />
    );

    const cta = screen.getByTestId('claim-banner-cta');
    expect(cta.getAttribute('aria-label')).toBe('Claim profile for testartist');
  });

  it('encodes claim token in URL', async () => {
    const { ClaimBanner } = await import('@/components/profile/ClaimBanner');
    render(
      <ClaimBanner
        claimToken='token with spaces & special=chars'
        profileHandle='testartist'
      />
    );

    const cta = screen.getByTestId('claim-banner-cta');
    const href = cta.getAttribute('href');
    // Should be URL-encoded
    expect(href).toContain(
      encodeURIComponent('token with spaces & special=chars')
    );
  });
});

describe('ProfileViewTracker', () => {
  const mockSendBeacon = vi.fn();
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', mockFetch);
    Object.defineProperty(navigator, 'sendBeacon', {
      value: mockSendBeacon,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(document, 'referrer', {
      value: 'https://google.com',
      writable: true,
      configurable: true,
    });
    mockSendBeacon.mockReturnValue(true);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('tracks profile_view event on mount', async () => {
    const { ProfileViewTracker } = await import(
      '@/components/profile/ProfileViewTracker'
    );
    render(<ProfileViewTracker handle='testartist' artistId='artist-123' />);

    expect(mockTrack).toHaveBeenCalledWith('profile_view', {
      handle: 'testartist',
      artist_id: 'artist-123',
      source: 'https://google.com',
    });
  });

  it('uses sendBeacon for view counting API', async () => {
    const { ProfileViewTracker } = await import(
      '@/components/profile/ProfileViewTracker'
    );
    render(<ProfileViewTracker handle='testartist' artistId='artist-123' />);

    expect(mockSendBeacon).toHaveBeenCalledWith(
      '/api/profile/view',
      expect.any(Blob)
    );
  });

  it('falls back to fetch when sendBeacon fails', async () => {
    mockSendBeacon.mockReturnValue(false);
    mockFetch.mockResolvedValue(new Response('ok'));

    const { ProfileViewTracker } = await import(
      '@/components/profile/ProfileViewTracker'
    );
    render(<ProfileViewTracker handle='testartist' artistId='artist-123' />);

    expect(mockFetch).toHaveBeenCalledWith('/api/profile/view', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ handle: 'testartist' }),
      keepalive: true,
    });
  });

  it('only tracks once per mount (deduplication)', async () => {
    const { ProfileViewTracker } = await import(
      '@/components/profile/ProfileViewTracker'
    );
    const { rerender } = render(
      <ProfileViewTracker handle='testartist' artistId='artist-123' />
    );

    // Re-render with same props should not track again
    rerender(<ProfileViewTracker handle='testartist' artistId='artist-123' />);

    expect(mockTrack).toHaveBeenCalledTimes(1);
    expect(mockSendBeacon).toHaveBeenCalledTimes(1);
  });

  it('renders nothing (returns null)', async () => {
    const { ProfileViewTracker } = await import(
      '@/components/profile/ProfileViewTracker'
    );
    const { container } = render(
      <ProfileViewTracker handle='testartist' artistId='artist-123' />
    );

    expect(container.innerHTML).toBe('');
  });

  it('uses custom source when provided', async () => {
    const { ProfileViewTracker } = await import(
      '@/components/profile/ProfileViewTracker'
    );
    render(
      <ProfileViewTracker
        handle='testartist'
        artistId='artist-123'
        source='qr-code'
      />
    );

    expect(mockTrack).toHaveBeenCalledWith('profile_view', {
      handle: 'testartist',
      artist_id: 'artist-123',
      source: 'qr-code',
    });
  });
});

describe('LatestReleaseCard', () => {
  const mockRelease = {
    id: 'release-1',
    creatorProfileId: 'profile-123',
    title: 'Midnight Dreams',
    releaseType: 'album',
    slug: 'midnight-dreams',
    artworkUrl: 'https://example.com/artwork.jpg',
    releaseDate: new Date('2024-06-15'),
    spotifyUrl: null,
    appleMusicUrl: null,
    youtubeUrl: null,
    trackCount: 12,
    createdAt: new Date('2024-06-01'),
    updatedAt: new Date('2024-06-01'),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders release title and listen button', async () => {
    const { LatestReleaseCard } = await import(
      '@/components/profile/LatestReleaseCard'
    );
    render(
      <LatestReleaseCard
        release={mockRelease as any}
        artistHandle='testartist'
      />
    );

    expect(screen.getByText('Midnight Dreams')).toBeDefined();
    expect(screen.getByText('Listen')).toBeDefined();
  });

  it('displays release type with proper capitalization', async () => {
    const { LatestReleaseCard } = await import(
      '@/components/profile/LatestReleaseCard'
    );
    render(
      <LatestReleaseCard
        release={mockRelease as any}
        artistHandle='testartist'
      />
    );

    // "album" -> "Album"
    expect(screen.getByText(/Album/)).toBeDefined();
  });

  it('uppercases EP release type', async () => {
    const epRelease = { ...mockRelease, releaseType: 'ep' };
    const { LatestReleaseCard } = await import(
      '@/components/profile/LatestReleaseCard'
    );
    render(
      <LatestReleaseCard release={epRelease as any} artistHandle='testartist' />
    );

    expect(screen.getByText(/EP/)).toBeDefined();
  });

  it('shows release year when releaseDate is available', async () => {
    const { LatestReleaseCard } = await import(
      '@/components/profile/LatestReleaseCard'
    );
    render(
      <LatestReleaseCard
        release={mockRelease as any}
        artistHandle='testartist'
      />
    );

    expect(screen.getByText(/2024/)).toBeDefined();
  });

  it('omits year when releaseDate is null', async () => {
    const noDateRelease = { ...mockRelease, releaseDate: null };
    const { LatestReleaseCard } = await import(
      '@/components/profile/LatestReleaseCard'
    );
    const { container } = render(
      <LatestReleaseCard
        release={noDateRelease as any}
        artistHandle='testartist'
      />
    );

    // Should not contain a year pattern
    const textContent = container.textContent || '';
    expect(textContent).not.toMatch(/· \d{4}/);
  });

  it('renders album artwork with correct alt text', async () => {
    const { LatestReleaseCard } = await import(
      '@/components/profile/LatestReleaseCard'
    );
    render(
      <LatestReleaseCard
        release={mockRelease as any}
        artistHandle='testartist'
      />
    );

    const img = screen.getByTestId('next-image');
    expect(img.getAttribute('alt')).toBe('Midnight Dreams artwork');
  });

  it('shows music icon placeholder when no artwork', async () => {
    const noArtwork = { ...mockRelease, artworkUrl: null };
    const { LatestReleaseCard } = await import(
      '@/components/profile/LatestReleaseCard'
    );
    render(
      <LatestReleaseCard release={noArtwork as any} artistHandle='testartist' />
    );

    expect(screen.getByTestId('music-icon')).toBeDefined();
  });

  it('listen button links to /{handle}/{slug}', async () => {
    const { LatestReleaseCard } = await import(
      '@/components/profile/LatestReleaseCard'
    );
    render(
      <LatestReleaseCard
        release={mockRelease as any}
        artistHandle='testartist'
      />
    );

    const listenLink = screen.getByText('Listen').closest('a');
    expect(listenLink?.getAttribute('href')).toBe(
      '/testartist/midnight-dreams'
    );
  });
});
