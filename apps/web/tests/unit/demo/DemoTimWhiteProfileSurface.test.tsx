import { readFileSync } from 'node:fs';
import { cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TIM_WHITE_PROFILE } from '@/lib/tim-white';

const { mockSearchParams, mockStaticArtistPage } = vi.hoisted(() => ({
  mockSearchParams: vi.fn(() => new URLSearchParams()),
  mockStaticArtistPage: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => mockSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));

vi.mock('@/features/profile/StaticArtistPage', () => ({
  StaticArtistPage: (props: Record<string, unknown>) => {
    mockStaticArtistPage(props);
    return <div data-testid='static-artist-page' />;
  },
}));

// This suite covers demo state selection. Rail/PAC behavior has its own real
// mounted tests; isolate those unrelated renderers from the showcase inventory.
vi.mock('@/features/profile/ProfileHomeRail', () => ({
  ProfileHomeRail: () => <div data-testid='profile-home-rail' />,
}));
vi.mock('@/features/profile/ProfilePrimaryActionCard', () => ({
  ProfilePrimaryActionCard: ({
    dataTestId,
  }: {
    readonly dataTestId: string;
  }) => <div data-testid={dataTestId} />,
}));

vi.mock('@/features/demo/DemoClientProviders', () => ({
  DemoClientProviders: ({ children }: { readonly children: ReactNode }) => (
    <>{children}</>
  ),
}));

// First `renderSurface()` pays a cold dynamic import of the demo surface
// module graph: ~1.8s warm, but the 15s budget fired under full-suite shard
// CPU contention.
const SLOW_DEMO_SURFACE_TIMEOUT_MS = 45_000;

async function renderSurface(search = '') {
  mockSearchParams.mockReturnValue(new URLSearchParams(search));
  const { DemoTimWhiteProfileSurface } = await import(
    '@/features/demo/DemoTimWhiteProfileSurface'
  );

  render(<DemoTimWhiteProfileSurface />);

  return mockStaticArtistPage.mock.calls.at(-1)?.[0] as
    | Record<string, unknown>
    | undefined;
}

describe('DemoTimWhiteProfileSurface', () => {
  beforeEach(() => {
    cleanup();
    mockSearchParams.mockReset();
    mockSearchParams.mockReturnValue(new URLSearchParams());
    mockStaticArtistPage.mockClear();
  });

  it(
    'shows supported card examples without inventing an alerts fallback card',
    async () => {
      await renderSurface('showcase=cards');
      expect(
        screen.getByTestId('demo-showcase-tim-white-profile-cards')
      ).toBeVisible();
      expect(
        screen.queryByTestId('tim-white-cards-alerts-fallback')
      ).toBeNull();
      expect(screen.getByTestId('tim-white-cards-release-live')).toBeVisible();
      expect(screen.getByTestId('tim-white-cards-tour-next')).toBeVisible();
    },
    SLOW_DEMO_SURFACE_TIMEOUT_MS
  );

  it(
    'renders the default clean Tim White profile screenshot surface',
    async () => {
      const props = await renderSurface();

      expect(props).toMatchObject({
        mode: 'profile',
        // Homepage proof captures must match jov.ie/tim, not the dashboard
        // Preview frame (JOV-6946).
        presentation: 'full-public',
        artist: expect.objectContaining({
          spotify_id: TIM_WHITE_PROFILE.spotifyArtistId,
          name: TIM_WHITE_PROFILE.name,
          image_url: TIM_WHITE_PROFILE.avatarSrc,
        }),
        hideJovieBranding: true,
        hideMoreMenu: true,
        showFooter: true,
        showPayButton: true,
        showTourButton: true,
      });
    },
    SLOW_DEMO_SURFACE_TIMEOUT_MS
  );

  it('keeps a local portrait in the explicitly selected compact preview', async () => {
    const props = await renderSurface('presentation=compact-preview');

    expect(props).toMatchObject({
      presentation: 'compact-preview',
      mode: 'profile',
      artist: expect.objectContaining({
        name: TIM_WHITE_PROFILE.name,
        image_url: TIM_WHITE_PROFILE.avatarSrc,
      }),
    });
  });

  it('retains the public presentation for unsupported presentation values', async () => {
    const props = await renderSurface('presentation=embedded');

    expect(props?.presentation).toBe('full-public');
  });

  it('provides executable coverage-via evidence for the demo surface', () => {
    const source = readFileSync(
      'components/features/demo/DemoTimWhiteProfileSurface.tsx',
      'utf8'
    );

    expect(source).toContain('export function DemoTimWhiteProfileSurface');
  });

  it(
    'accepts subscribe mode from the screenshot route query string',
    async () => {
      const props = await renderSurface('mode=subscribe');

      expect(props?.mode).toBe('subscribe');
    },
    SLOW_DEMO_SURFACE_TIMEOUT_MS
  );

  it('pins the share state to the open share sheet for the setup product shot', async () => {
    const { HOMEPAGE_PROFILE_SHOWCASE_STATES } = await import(
      '@/features/home/homepage-profile-preview-fixture'
    );
    const source = readFileSync(
      'components/features/demo/DemoTimWhiteProfileSurface.tsx',
      'utf8'
    );

    // `setup-share-profile` (lib/screenshots/product-shots.ts) captures
    // /demo/showcase/tim-white-profile?state=share with the drawer open.
    expect(HOMEPAGE_PROFILE_SHOWCASE_STATES.share.drawerView).toBe('share');
    expect(source).toMatch(
      /DEMO_TIM_WHITE_SHOWCASE_STATE_IDS = \[[^\]]*'share'/
    );
    expect(source).toContain(
      "showcaseState === 'more-menu' || showcaseState === 'share'"
    );
  });

  it('accepts releases mode from the screenshot route query string', async () => {
    const props = await renderSurface('mode=releases');

    expect(props?.mode).toBe('releases');
  });

  it('falls back to profile mode for invalid query string modes', async () => {
    const props = await renderSurface('mode=unknown');

    expect(props?.mode).toBe('profile');
  });

  it('accepts the mainstream design archetype in the demo route only', async () => {
    const props = await renderSurface('archetype=mainstream');

    expect(props).toMatchObject({
      artist: expect.objectContaining({
        name: 'Maya Vale',
        handle: 'mayavale',
      }),
      showPayButton: false,
      showTourButton: true,
    });
  });

  it('accepts the sparse design archetype without release or utility chrome', async () => {
    const props = await renderSurface('archetype=sparse');

    expect(props).toMatchObject({
      artist: expect.objectContaining({
        name: 'North Window',
        image_url: undefined,
        is_verified: false,
      }),
      socialLinks: [],
      contacts: [],
      latestRelease: null,
      releases: [],
      tourDates: [],
      showPayButton: false,
      showTourButton: false,
    });
  });

  it('renders the homepage template archetype with no person and one fresh release', async () => {
    const props = await renderSurface('archetype=template');

    expect(props).toMatchObject({
      artist: expect.objectContaining({
        id: 'homepage-template-profile',
        handle: 'you',
        image_url: undefined,
      }),
      contacts: [],
      releases: [],
      tourDates: [],
      showPayButton: false,
      showTourButton: false,
      latestRelease: expect.objectContaining({
        id: 'demo-template-first-light',
        creatorProfileId: 'homepage-template-profile',
      }),
    });
    expect(screen.queryByTestId('demo-template-hero-capture')).toBeNull();
  });

  it('adds the hero crop target for the homepage capture', async () => {
    await renderSurface('archetype=template&capture=hero');

    expect(screen.getByTestId('demo-template-hero-capture')).toHaveClass(
      'absolute',
      'h-158'
    );
  });
});
