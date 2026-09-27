// Renders the real `/` page module with the v3 dark-launch flag pinned on,
// then off, so the flip PR only changes a default, never the composition.
import { render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const flags = vi.hoisted(() => ({ HOMEPAGE_V3_ENABLED: true }));
vi.mock('@/lib/flags/homepage-v3', () => ({
  get HOMEPAGE_V3_ENABLED() {
    return flags.HOMEPAGE_V3_ENABLED;
  },
}));

vi.mock('@/lib/analytics', () => ({ track: vi.fn(), page: vi.fn() }));
vi.mock('@/components/homepage/homepage-analytics', () => ({
  trackHomepageEvent: vi.fn(),
}));
vi.mock('next/navigation', async importOriginal => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/',
}));
vi.mock('@/lib/queries/useArtistSearchQuery', () => ({
  useArtistSearchQuery: () => ({
    results: [],
    state: 'idle',
    search: vi.fn(),
    clear: vi.fn(),
  }),
}));
vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) => {
    const { fill, priority, quality, unoptimized, ...rest } = props;
    void fill;
    void priority;
    void quality;
    void unoptimized;
    return <img alt='' {...rest} />;
  },
}));

async function renderHomePage() {
  const { default: HomePage } = await import('@/app/(home)/page');
  return render(await HomePage());
}

describe('homepage v3 page composition', { timeout: 60_000 }, () => {
  afterEach(() => {
    vi.resetModules();
  });

  it('mounts the v3 hero, presence, structure, and close with the flag on', async () => {
    flags.HOMEPAGE_V3_ENABLED = true;
    const { container } = await renderHomePage();

    const ids = [
      ...container.querySelectorAll('section[data-homepage-testid]'),
    ].map(section => section.getAttribute('data-homepage-testid'));
    expect(ids).toEqual([
      'homepage-hero-shell',
      'homepage-section-presence',
      'homepage-section-structure',
      'homepage-close',
    ]);
    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'A living identity for the internet.',
      })
    ).toBeInTheDocument();

    // One primary action label and destination in hero and close.
    const hero = screen.getByTestId('marketing-section-hero');
    const close = screen.getByTestId('marketing-section-cta');
    for (const region of [hero, close]) {
      const actions = within(region).getAllByRole('link');
      expect(actions).toHaveLength(1);
      expect(actions[0]).toHaveAccessibleName('Request access');
      expect(actions[0]).toHaveAttribute('href', '/signup');
    }

    // Each background image once, each in its own section.
    const backgrounds = [
      ...container.querySelectorAll('[data-background-image]'),
    ].map(node => node.getAttribute('data-background-image'));
    expect(backgrounds).toEqual([
      '/assets/generated/homepage-hero-technical-texture-v1.webp',
      '/assets/generated/homepage-presence-satin-v1.webp',
    ]);
    expect(screen.queryByText("What's new in Jovie")).toBeNull();
  });

  it('keeps the live homepage unchanged with the flag off', async () => {
    flags.HOMEPAGE_V3_ENABLED = false;
    await renderHomePage();

    expect(screen.getByRole('heading', { level: 1 }).textContent).not.toBe(
      'A living identity for the internet.'
    );
    expect(screen.queryByTestId('homepage-identity-hero-texture')).toBeNull();
    expect(screen.queryByTestId('homepage-presence-material')).toBeNull();
  });
});
