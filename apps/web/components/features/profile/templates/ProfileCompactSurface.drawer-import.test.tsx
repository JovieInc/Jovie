import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen } from '@testing-library/react';
import React from 'react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { Artist } from '@/types/db';
import { ProfileCompactSurface } from './ProfileCompactSurface';
import { PublicProfileLayoutShell } from './PublicProfileLayoutShell';

vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    ...props
  }: {
    readonly children: React.ReactNode;
    readonly href: string;
    readonly [key: string]: unknown;
  }) => React.createElement('a', { href, ...props }, children),
}));

vi.mock('@/lib/analytics', () => ({ track: vi.fn() }));

const artist = {
  id: 'artist-1',
  handle: 'timwhite',
  name: 'Tim White',
  image_url: null,
} as unknown as Artist;

// The unified drawer loads through useProfileUnifiedDrawerModule, not a
// lazy boundary (JOV-7973): the deep-link pay arrival records its
// usable-alias-result when the pay drawer becomes visible, so the module
// must land in state from a mount-time import — the drawer then renders
// in the same commit the drawer-open state flips, with no Suspense
// suspend/retry cycle gating it.
describe('ProfileCompactSurface drawer import', () => {
  beforeAll(async () => {
    // Warm the module registry so the surface's mount-time import resolves
    // within a microtask (vite transforms the drawer module on first import).
    await import('@/features/profile/ProfileUnifiedDrawer');
  });

  it('renders the pay drawer from the mount-time module load with no lazy overlay gate', async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    render(
      <React.Suspense fallback={<div role='status'>Loading profile</div>}>
        <PublicProfileLayoutShell
          artistName={artist.name}
          heroImageUrl={null}
          heroImageError={false}
          isDesktopLayout={false}
          shouldRenderHeading={false}
          profileAccentStyle={{}}
          compactSurface={
            <ProfileCompactSurface
              artist={artist}
              socialLinks={[]}
              contacts={[]}
              drawerOpen
              drawerView='pay'
              activeMode='pay'
              onDrawerOpenChange={vi.fn()}
              onDrawerViewChange={vi.fn()}
              onBack={vi.fn()}
              onOpenMenu={vi.fn()}
              onPlayClick={vi.fn()}
              onShare={vi.fn()}
              profileHref='/timwhite'
              renderInteractiveOverlays
            />
          }
        />
      </React.Suspense>,
      {
        wrapper: ({ children }) => (
          <QueryClientProvider client={queryClient}>
            {children}
          </QueryClientProvider>
        ),
      }
    );
    // One microtask flush resolves the (already-loaded) module import — no
    // pending overlay promise, no Suspense fallback leak.
    await act(async () => {});
    expect(
      document.querySelector('[data-testid="profile-mode-drawer-pay"]')
    ).not.toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('keeps the drawer out of the lazy graph and loads it at mount', () => {
    const source = readFileSync(
      resolve(__dirname, './ProfileCompactSurface.tsx'),
      'utf8'
    );
    // The drawer must never be registered as a dynamic overlay again: the
    // lazy boundary re-adds the retry-lane delay the budgets gate on.
    expect(source).not.toMatch(/ProfileUnifiedDrawer\s*=\s*dynamic/);
    expect(source).toContain(
      "import { ProfileUnifiedDrawerSlot } from './useProfileUnifiedDrawerModule';"
    );
    expect(source).toContain('<ProfileUnifiedDrawerSlot');
    const hook = readFileSync(
      resolve(__dirname, './useProfileUnifiedDrawerModule.ts'),
      'utf8'
    );
    // Mount-time import keeps the module a separate chunk — a static import
    // here would pull the drawer bytes into shared graph routes (e.g. the
    // /exp page builder's first-load JS budget).
    expect(hook).toContain("import('@/features/profile/ProfileUnifiedDrawer')");
    // The module-level import of the drawer symbol must stay type-only
    // (erased at runtime) so the drawer bytes never join shared-graph
    // routes' first-load JS (e.g. the /exp page builder budget).
    expect(hook).toMatch(
      /import type \{ ProfileUnifiedDrawer \} from '@\/features\/profile\/ProfileUnifiedDrawer';/
    );
  });
});
