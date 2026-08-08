import { render, screen, waitFor } from '@testing-library/react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import MarketingLayout from '@/app/(marketing)/layout';
import { ArtistProfileLandingRoute } from '@/components/marketing/artist-profile/ArtistProfileLandingRoute';

vi.mock('next/navigation', () => ({
  usePathname: () => '/artist-profiles',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
  redirect: vi.fn(),
  notFound: vi.fn(),
}));

/**
 * The page-level tests deliberately mock the public shell to keep their
 * section-order assertions small. Keep one unmocked composition test here:
 * Radix Slot errors only surface once the route is rendered with its real
 * header, footer, and client marketing enhancements.
 */
describe('ArtistProfileLandingRoute runtime composition', () => {
  it('renders the full public marketing shell without a Radix Slot boundary', async () => {
    const layout = await MarketingLayout({
      children: <ArtistProfileLandingRoute />,
    });

    expect(() => render(layout)).not.toThrow();
    // MarketingEnhancements is intentionally client-idle loaded. Let that
    // route-only hydration path settle instead of treating the static shell as
    // sufficient runtime coverage.
    await waitFor(
      () => expect(document.documentElement.style.overflowY).toBe('auto'),
      { timeout: 1_000 }
    );
    expect(screen.getByRole('main')).toBeInTheDocument();
    expect(
      screen.getByTestId('artist-profile-adaptive-sequence')
    ).toBeInTheDocument();
  });

  it('hydrates the full artist-profile route without a Slot exception', async () => {
    const layout = await MarketingLayout({
      children: <ArtistProfileLandingRoute />,
    });
    const container = document.createElement('div');
    container.innerHTML = renderToString(layout);
    document.body.append(container);
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    const root = hydrateRoot(container, layout);
    await waitFor(
      () => expect(document.documentElement.style.overflowY).toBe('auto'),
      { timeout: 1_000 }
    );

    expect(consoleError).not.toHaveBeenCalledWith(
      expect.stringContaining('Slot failed to slot onto its children')
    );

    root.unmount();
    consoleError.mockRestore();
    container.remove();
  });
});
