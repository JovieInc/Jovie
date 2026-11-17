import { act, renderHook, waitFor } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Artist } from '@/types/db';
import type { ProfileDesktopSurfaceProps } from './ProfileDesktopSurface';
import {
  DesktopSurfaceSlot,
  useDesktopSurfaceModule,
} from './useDesktopSurfaceModule';

const moduleState = vi.hoisted(() => ({
  attempts: 0,
  reject: false,
  gate: undefined as Promise<void> | undefined,
}));

beforeEach(() => {
  vi.resetModules();
  moduleState.attempts = 0;
  moduleState.reject = false;
  moduleState.gate = undefined;
  vi.doMock('@/features/profile/templates/ProfileDesktopSurface', async () => {
    moduleState.attempts += 1;
    await moduleState.gate;
    if (moduleState.reject) throw new Error('Desktop chunk unavailable');
    return { ProfileDesktopSurface: () => null };
  });
});

const artist = {
  id: 'artist-1',
  owner_user_id: 'user-1',
  name: 'Test Artist',
  handle: 'testartist',
  spotify_id: null,
  image_url: 'https://example.com/desktop-hero.jpg',
  tagline: null,
  location: null,
  hometown: null,
  career_highlights: null,
  is_verified: false,
  active_since_year: null,
  published: true,
  is_featured: false,
  marketing_opt_out: false,
  created_at: '2026-11-17T00:00:00.000Z',
  settings: {},
} satisfies Artist;

const props = {
  artist,
  socialLinks: [],
  contacts: [],
  drawerOpen: false,
  drawerView: 'menu',
  onDrawerOpenChange: vi.fn(),
  onDrawerViewChange: vi.fn(),
  onOpenMenu: vi.fn(),
  onPlayClick: vi.fn(),
  profileHref: '/testartist',
} satisfies ProfileDesktopSurfaceProps;

function serverPaint(imageUrl: string | null = artist.image_url) {
  const container = document.createElement('div');
  container.innerHTML = renderToString(
    <DesktopSurfaceSlot
      {...props}
      artist={{ ...artist, image_url: imageUrl }}
      surface={null}
    />
  );
  return container;
}

describe('desktop surface server paint', () => {
  it('keeps the hidden desktop hero out of mobile image preloads', () => {
    const container = serverPaint();
    expect(container.querySelector('img')).toHaveAttribute('loading', 'lazy');
    expect(
      container.querySelector('link[rel="preload"][as="image"]')
    ).toBeNull();
    expect(container.querySelector('img')).toHaveAttribute(
      'src',
      artist.image_url
    );
    expect(container.querySelector('nav')).toHaveAccessibleName(
      'Profile sections'
    );
    expect(container.textContent).toContain(artist.name);
  });

  it.each([null, '/avatars/default-user.png'])(
    'keeps the fallback navigable without a custom artist image (%s)',
    imageUrl => {
      const container = serverPaint(imageUrl);
      expect(container.querySelector('img')).toBeNull();
      expect(container.querySelectorAll('nav a').length).toBeGreaterThan(0);
    }
  );

  it('hands the same props to the loaded surface', () => {
    const surface = vi.fn((_props: ProfileDesktopSurfaceProps) => (
      <p>Interactive desktop</p>
    ));
    const html = renderToString(
      <DesktopSurfaceSlot {...props} surface={surface} />
    );
    expect(html).toContain('Interactive desktop');
    expect(surface.mock.calls[0]?.[0]).toMatchObject(props);
    expect(html).not.toContain('Profile sections');
  });
});

describe('desktop surface module lifecycle', () => {
  it('keeps mobile unloaded and cancels a pending handoff when the viewport narrows', async () => {
    let resolveModule: () => void = () => {};
    moduleState.gate = new Promise<void>(resolve => {
      resolveModule = resolve;
    });
    const { result, rerender } = renderHook(
      ({ enabled }) => useDesktopSurfaceModule(enabled),
      { initialProps: { enabled: false } }
    );
    expect(moduleState.attempts).toBe(0);
    rerender({ enabled: true });
    await waitFor(() => expect(moduleState.attempts).toBe(1));
    rerender({ enabled: false });
    await act(async () => resolveModule());
    expect(result.current.Surface).toBeNull();
    rerender({ enabled: true });
    await waitFor(() => expect(result.current.Surface).not.toBeNull());
    const loaded = result.current.Surface;
    rerender({ enabled: false });
    rerender({ enabled: true });
    expect(result.current.Surface).toBe(loaded);
    expect(moduleState.attempts).toBe(1);
  });

  it('retains the navigable fallback when the desktop chunk fails', async () => {
    moduleState.reject = true;
    const { result } = renderHook(() => useDesktopSurfaceModule(true));
    await waitFor(() => expect(moduleState.attempts).toBe(1));
    expect(result.current.Surface).toBeNull();
    expect(serverPaint().querySelectorAll('nav a').length).toBeGreaterThan(0);
  });
});
