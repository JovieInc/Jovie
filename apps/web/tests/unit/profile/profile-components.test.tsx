/**
 * Component tests for public profile UI components.
 *
 * Tests:
 * - ClaimBanner: rendering, auth-aware URLs, accessibility
 * - ProfileViewTracker: analytics tracking, sendBeacon, deduplication
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import type { ReactElement } from 'react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProfileViewTracker } from '@/features/profile/ProfileViewTracker';

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

function renderWithQueryClient(ui: ReactElement) {
  const queryClient = createTestQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
  );
}

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
  useAuthSafe: () => ({ isSignedIn: false }),
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
vi.mock('lucide-react', async importOriginal => {
  const actual = await importOriginal<typeof import('lucide-react')>();

  return {
    ...actual,
    ArrowRight: (props: Record<string, unknown>) =>
      React.createElement('svg', { 'data-testid': 'arrow-right', ...props }),
    Sparkles: (props: Record<string, unknown>) =>
      React.createElement('svg', { 'data-testid': 'sparkles', ...props }),
    Music: (props: Record<string, unknown>) =>
      React.createElement('svg', { 'data-testid': 'music-icon', ...props }),
    Music2: (props: Record<string, unknown>) =>
      React.createElement('svg', { 'data-testid': 'music2-icon', ...props }),
  };
});

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
    const { ClaimBanner } = await import('@/features/profile/ClaimBanner');
    render(
      <ClaimBanner
        profileHandle='testartist'
        displayName='Test Artist'
        ctaHref='/signup?handle=testartist'
      />
    );

    expect(screen.getByTestId('claim-banner')).toBeDefined();
    expect(screen.getByText(/Claim Profile/)).toBeDefined();
  });

  it('has proper accessibility attributes', async () => {
    const { ClaimBanner } = await import('@/features/profile/ClaimBanner');
    render(
      <ClaimBanner
        profileHandle='testartist'
        displayName='Test Artist'
        ctaHref='/signup?handle=testartist'
      />
    );

    const banner = screen.getByTestId('claim-banner');
    expect(banner).toBeDefined();

    const cta = screen.getByTestId('claim-banner-cta');
    expect(cta.getAttribute('aria-label')).toBe(
      'Claim Profile for Test Artist'
    );
  });

  it('links to signup with redirect for all users', async () => {
    mockUseUserSafe.mockReturnValue({
      isSignedIn: false,
      isLoaded: true,
      user: null,
    });

    const { ClaimBanner } = await import('@/features/profile/ClaimBanner');
    render(
      <ClaimBanner
        profileHandle='testartist'
        ctaHref='/signup?redirect_url=%2Fonboarding'
      />
    );

    const cta = screen.getByTestId('claim-banner-cta');
    const href = cta.getAttribute('href');
    expect(href).toContain('/signup');
    expect(href).toContain('redirect_url');
    // Token is no longer included in banner URL (hashed at rest)
    expect(href).not.toContain('token');
  });

  it('falls back to handle when displayName not provided', async () => {
    const { ClaimBanner } = await import('@/features/profile/ClaimBanner');
    render(
      <ClaimBanner
        profileHandle='testartist'
        ctaHref='/signup?handle=testartist'
      />
    );

    const cta = screen.getByTestId('claim-banner-cta');
    expect(cta.getAttribute('aria-label')).toBe('Claim Profile for testartist');
  });
});

describe('ProfileViewTracker', () => {
  const mockSendBeacon = vi.fn();
  const mockFetch = vi.fn().mockResolvedValue(new Response('ok'));

  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockResolvedValue(new Response('ok'));
    vi.stubGlobal('fetch', mockFetch);
    // requestIdleCallback runs synchronously in tests so tracking assertions work
    vi.stubGlobal('requestIdleCallback', (cb: () => void) => {
      cb();
      return 0;
    });
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
    renderWithQueryClient(
      <ProfileViewTracker handle='testartist' artistId='artist-123' />
    );

    expect(mockTrack).toHaveBeenCalledWith('profile_view', {
      handle: 'testartist',
      artist_id: 'artist-123',
      source: 'https://google.com',
    });
  });

  it('uses sendBeacon for view counting API', async () => {
    renderWithQueryClient(
      <ProfileViewTracker handle='testartist' artistId='artist-123' />
    );

    expect(mockSendBeacon).toHaveBeenCalledWith(
      '/api/profile/view',
      expect.any(Blob)
    );
  });

  it('falls back to fetch when sendBeacon fails', async () => {
    mockSendBeacon.mockReturnValue(false);
    mockFetch.mockResolvedValue(new Response('ok'));

    renderWithQueryClient(
      <ProfileViewTracker handle='testartist' artistId='artist-123' />
    );

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/profile/view', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ handle: 'testartist' }),
        keepalive: true,
      });
    });
  });

  it('only tracks once per mount (deduplication)', async () => {
    const queryClient = createTestQueryClient();
    const { rerender } = render(
      <QueryClientProvider client={queryClient}>
        <ProfileViewTracker handle='testartist' artistId='artist-123' />
      </QueryClientProvider>
    );

    // Re-render with same props should not track again
    rerender(
      <QueryClientProvider client={queryClient}>
        <ProfileViewTracker handle='testartist' artistId='artist-123' />
      </QueryClientProvider>
    );

    expect(mockTrack).toHaveBeenCalledTimes(1);
    expect(mockSendBeacon).toHaveBeenCalledTimes(1);
  });

  it('renders nothing (returns null)', async () => {
    const { container } = renderWithQueryClient(
      <ProfileViewTracker handle='testartist' artistId='artist-123' />
    );

    expect(container.innerHTML).toBe('');
  });

  it('uses custom source when provided', async () => {
    renderWithQueryClient(
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
