import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import type { ImgHTMLAttributes } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import MarketingLayout from '@/app/(marketing)/layout';
import { ArtistProfileLandingRoute } from '@/components/marketing/artist-profile/ArtistProfileLandingRoute';
import { MARKETING_ROUTE_MANIFEST } from '@/data/marketing/routeManifest';

vi.mock('next/navigation', () => ({
  usePathname: () => '/artist-profiles',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
  redirect: vi.fn(),
  notFound: vi.fn(),
}));

// next/image with `priority` makes React DOM preload the image by querying
// `link[imagesrcset="..."]`; the hero's srcset makes that selector longer
// than the 2048-character limit jsdom 30's selector engine enforces, which
// throws an unhandled RangeError. Image preloading is not what this
// composition test covers (Radix Slot boundaries are), so render a plain img.
vi.mock('next/image', () => ({
  default: ({
    fill: _fill,
    priority: _priority,
    quality: _quality,
    placeholder: _placeholder,
    blurDataURL: _blurDataURL,
    unoptimized: _unoptimized,
    loader: _loader,
    ...props
  }: ImgHTMLAttributes<HTMLImageElement> & Record<string, unknown>) => (
    <img {...props} alt={typeof props.alt === 'string' ? props.alt : ''} />
  ),
}));

/**
 * The page-level tests deliberately mock the public shell to keep their
 * section-order assertions small. Keep one unmocked composition test here:
 * Radix Slot errors only surface once the route is rendered with its real
 * header, footer, and client marketing enhancements.
 */
describe('ArtistProfileLandingRoute runtime composition', () => {
  let idleCallback: IdleRequestCallback | undefined;

  beforeEach(() => {
    idleCallback = undefined;
    vi.stubGlobal('requestIdleCallback', (callback: IdleRequestCallback) => {
      idleCallback = callback;
      return 1;
    });
    vi.stubGlobal('cancelIdleCallback', vi.fn());
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  const settleEnhancements = async () => {
    // Drive the real idle callback and imports. Wall-clock polling races the
    // deferred import transforms when coverage workers are busy.
    expect(idleCallback).toBeTypeOf('function');
    await act(async () => {
      idleCallback?.({ didTimeout: false, timeRemaining: () => 50 });
      await vi.dynamicImportSettled();
    });
  };

  it('renders the full public marketing shell without a Radix Slot boundary', async () => {
    const layout = await MarketingLayout({
      children: (
        <ArtistProfileLandingRoute
          logoPlacement={{ page: '/artist-profiles' }}
        />
      ),
    });

    expect(() => render(layout)).not.toThrow();
    await settleEnhancements();
    await waitFor(
      () => expect(document.documentElement.style.overflowY).toBe('auto'),
      { timeout: 1_000 }
    );
    expect(screen.getByRole('main')).toBeInTheDocument();
    const route = MARKETING_ROUTE_MANIFEST.find(
      entry => entry.url === '/artist-profiles'
    );
    const roots = Array.from(
      document.querySelectorAll('section[data-testid^="marketing-section-"]')
    );
    const expected =
      route?.renderedSections.filter(
        entry => entry.kind === 'approved-section'
      ) ?? [];
    expect(
      roots.map(root => ({
        sectionId: root
          .getAttribute('data-testid')
          ?.replace('marketing-section-', ''),
        variantId: root.getAttribute('data-marketing-variant'),
        componentPath: root.getAttribute('data-marketing-owner'),
        occurrenceId:
          root.getAttribute('data-marketing-occurrence') ?? undefined,
      }))
    ).toEqual(
      expected.map(({ sectionId, variantId, componentPath, occurrenceId }) => ({
        sectionId,
        variantId,
        componentPath,
        occurrenceId,
      }))
    );
    expect(
      screen.getByTestId('artist-profile-adaptive-sequence')
    ).toBeInTheDocument();
  });

  it('hydrates the full artist-profile route without a Slot exception', async () => {
    const layout = await MarketingLayout({
      children: (
        <ArtistProfileLandingRoute
          logoPlacement={{ page: '/artist-profiles' }}
        />
      ),
    });
    const container = document.createElement('div');
    container.innerHTML = renderToString(layout);
    document.body.append(container);
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    let root: ReturnType<typeof hydrateRoot> | undefined;
    try {
      await act(async () => {
        root = hydrateRoot(container, layout);
      });
      await settleEnhancements();
      await waitFor(
        () => expect(document.documentElement.style.overflowY).toBe('auto'),
        { timeout: 1_000 }
      );

      expect(consoleError).not.toHaveBeenCalledWith(
        expect.stringContaining('Slot failed to slot onto its children')
      );
    } finally {
      await act(async () => root?.unmount());
      consoleError.mockRestore();
      container.remove();
    }
  });
});
