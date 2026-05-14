/**
 * No-flicker regression tests for ProfileUnifiedDrawer (JOV-2150).
 *
 * The original bug: an effect mutated `view` → 'menu' the moment
 * `canOpenReleasesDrawer` flipped false during a releases query refetch.
 * When the data resolved, the drawer rendered releases again — producing
 * a visible flicker. The fix removed the effect; `resolveRenderedView`
 * handles the render-time fallback without mutating state.
 *
 * Invariant: when capability transiently flips false (refetch with empty
 * data), the drawer must NOT call `onViewChange`.
 */
import { cleanup, render } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { PublicRelease } from '@/components/features/profile/releases/types';
import type { Artist } from '@/types/db';

// ─── Mocks aligned with ProfileUnifiedDrawerReleases.test.tsx ────────────────

vi.mock('@/features/profile/ProfileDrawerShell', () => ({
  ProfileDrawerShell: ({
    open,
    onOpenChange,
    title,
    children,
    dataTestId,
  }: {
    readonly open: boolean;
    readonly onOpenChange: (open: boolean) => void;
    readonly title: string;
    readonly children: React.ReactNode;
    readonly dataTestId?: string;
  }) => (
    <div data-testid={dataTestId ?? 'profile-drawer-shell'}>
      {open ? (
        <button
          type='button'
          data-testid='profile-drawer-shell-close'
          onClick={() => onOpenChange(false)}
        >
          Close
        </button>
      ) : null}
      <div data-testid='drawer-title'>{title}</div>
      {children}
    </div>
  ),
}));

vi.mock('@/features/profile/AboutSection', () => ({
  AboutSection: () => <div data-testid='about-section' />,
}));

vi.mock('@/features/profile/TourModePanel', () => ({
  TourDrawerContent: () => <div data-testid='tour-drawer-content' />,
}));

vi.mock('@/features/profile/StaticListenInterface', () => ({
  StaticListenInterface: () => <div data-testid='static-listen-interface' />,
}));

vi.mock('@/features/profile/artist-notifications-cta', () => ({
  TwoStepNotificationsCTA: () => <div data-testid='two-step-notifications' />,
  ArtistNotificationsCTA: () => <div data-testid='artist-notifications' />,
}));

vi.mock('@/components/molecules/TipSelector', () => ({
  TipSelector: () => <div data-testid='tip-selector' />,
}));

vi.mock('@/features/profile/artist-contacts-button/useArtistContacts', () => ({
  useArtistContacts: () => ({
    getActionHref: () => 'mailto:test@example.com',
    trackAction: vi.fn(),
  }),
}));

vi.mock('@/lib/analytics', () => ({ track: vi.fn() }));

vi.mock('@/components/atoms/ImageWithFallback', () => ({
  ImageWithFallback: ({ alt }: { readonly alt: string }) => (
    <img alt={alt} data-testid='release-artwork' />
  ),
}));

const mockArtist: Artist = {
  id: 'artist-1',
  name: 'Test Artist',
  handle: 'testartist',
  image_url: null,
  tagline: null,
  location: null,
  hometown: null,
  career_highlights: null,
  is_public: true,
  is_verified: false,
  active_since_year: null,
  published: true,
  is_verified_flag: false,
};

function makeRelease(overrides: Partial<PublicRelease> = {}): PublicRelease {
  return {
    id: `release-${Math.random().toString(36).slice(2)}`,
    title: 'Test Song',
    slug: 'test-song',
    releaseType: 'single',
    releaseDate: '2024-06-15T00:00:00.000Z',
    artworkUrl: 'https://example.com/art.jpg',
    artistNames: ['Test Artist'],
    ...overrides,
  };
}

const baseProps = {
  open: true,
  view: 'releases' as const,
  artist: mockArtist,
  socialLinks: [],
  contacts: [],
  primaryChannel: vi.fn() as never,
  dsps: [],
  isSubscribed: false,
  contentPrefs: { newMusic: true, tourDates: true, merch: true, general: true },
  onTogglePref: vi.fn(),
  onUnsubscribe: vi.fn(),
  isUnsubscribing: false,
  onShare: vi.fn(),
  hasAbout: false,
  hasTourDates: false,
  hasTip: false,
  hasContacts: false,
};

let ProfileUnifiedDrawer: typeof import('@/features/profile/ProfileUnifiedDrawer').ProfileUnifiedDrawer;

describe('ProfileUnifiedDrawer — no-flicker invariant (JOV-2150)', () => {
  beforeAll(async () => {
    ({ ProfileUnifiedDrawer } = await import(
      '@/features/profile/ProfileUnifiedDrawer'
    ));
  }, 10_000);

  afterEach(() => cleanup());

  it('does NOT call onViewChange when releases data transiently empties', () => {
    const onViewChange = vi.fn();
    const onOpenChange = vi.fn();

    const { rerender } = render(
      <ProfileUnifiedDrawer
        {...(baseProps as never)}
        onOpenChange={onOpenChange}
        onViewChange={onViewChange}
        hasReleases={true}
        releases={[makeRelease({ id: 'r1', slug: 'first', title: 'First' })]}
      />
    );

    // Simulate refetch race: data temporarily empty.
    rerender(
      <ProfileUnifiedDrawer
        {...(baseProps as never)}
        onOpenChange={onOpenChange}
        onViewChange={onViewChange}
        hasReleases={false}
        releases={[]}
      />
    );

    // The drawer must keep view='releases' in parent state. The pre-fix
    // effect would have called onViewChange('menu') here, producing the
    // flicker — the post-fix rendering handles this without mutation.
    expect(onViewChange).not.toHaveBeenCalled();
  });

  it('recovers cleanly when releases data comes back without mutating view', () => {
    const onViewChange = vi.fn();
    const onOpenChange = vi.fn();

    const { rerender } = render(
      <ProfileUnifiedDrawer
        {...(baseProps as never)}
        onOpenChange={onOpenChange}
        onViewChange={onViewChange}
        hasReleases={false}
        releases={[]}
      />
    );

    expect(onViewChange).not.toHaveBeenCalled();

    rerender(
      <ProfileUnifiedDrawer
        {...(baseProps as never)}
        onOpenChange={onOpenChange}
        onViewChange={onViewChange}
        hasReleases={true}
        releases={[makeRelease({ id: 'r1', slug: 'first', title: 'First' })]}
      />
    );

    expect(onViewChange).not.toHaveBeenCalled();
  });
});
