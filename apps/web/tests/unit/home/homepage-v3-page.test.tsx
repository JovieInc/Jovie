// Renders the real `/` page module with the v3 flag pinned on (the default
// since 2026-09-28), then off (rollback), so both compositions stay exact.
import { render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getBlogPosts } from '@/lib/blog/getBlogPosts';

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
vi.mock('@/lib/blog/getBlogPosts', { spy: true });
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
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('mounts the v3 hero, presence, structure, news, and close with the flag on', async () => {
    flags.HOMEPAGE_V3_ENABLED = true;
    const { container } = await renderHomePage();

    const ids = [
      ...container.querySelectorAll(
        '[data-homepage-testid], [data-testid="marketing-section-blog-feed"]'
      ),
    ]
      .map(
        section =>
          section.getAttribute('data-homepage-testid') ??
          section.getAttribute('data-testid')
      )
      .filter(id => !id?.startsWith('homepage-possibility-'));
    expect(ids).toEqual([
      'homepage-hero-shell',
      'homepage-section-presence',
      'homepage-section-structure',
      'marketing-section-blog-feed',
      'homepage-close',
    ]);
    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'Be found.Be understood.',
      })
    ).toBeInTheDocument();

    // One jov.ie/you claim action in hero and close (Tim 2026-09-28).
    const hero = screen.getByTestId('marketing-section-hero');
    const close = screen.getByTestId('marketing-section-cta');
    for (const region of [hero, close]) {
      expect(within(region).getByRole('textbox')).toHaveAttribute(
        'placeholder',
        'you'
      );
      expect(within(region).queryByText('Search your name')).toBeNull();
      expect(within(region).queryAllByRole('link')).toHaveLength(0);
      expect(
        within(region).queryByText('Request access')
      ).not.toBeInTheDocument();
    }

    // Each background image once, each in its own section.
    const backgrounds = [
      ...container.querySelectorAll('[data-background-image]'),
    ].map(node => node.getAttribute('data-background-image'));
    expect(backgrounds).toEqual([
      '/assets/generated/homepage-presence-satin-v1.webp',
    ]);
    expect(screen.queryByText("What's new in Jovie")).toBeNull();
    const news = screen.getByRole('region', { name: 'Latest News' });
    expect(within(news).getAllByRole('article')).toHaveLength(4);
    expect(
      within(news).getByRole('link', { name: 'All posts' })
    ).toHaveAttribute('href', '/blog');
  });

  it('keeps the live story stack with the flag off', async () => {
    flags.HOMEPAGE_V3_ENABLED = false;
    await renderHomePage();
    expect(getBlogPosts).not.toHaveBeenCalled();

    // The identity hero stays live; only the v3 body is gated.
    expect(screen.getByTestId('homepage-claim-card')).not.toBeNull();
    expect(screen.getByTestId('homepage-story-stack')).not.toBeNull();
    expect(screen.queryByTestId('homepage-identity-story-stack')).toBeNull();
    expect(screen.queryByTestId('homepage-presence-material')).toBeNull();
    expect(screen.queryByTestId('homepage-section-structure')).toBeNull();
    expect(screen.queryByRole('region', { name: 'Latest News' })).toBeNull();
  });

  it('propagates invalid catalog errors without fabricated cards', async () => {
    flags.HOMEPAGE_V3_ENABLED = true;
    vi.mocked(getBlogPosts).mockRejectedValueOnce(
      new Error('Invalid publication catalog')
    );
    await expect(renderHomePage()).rejects.toThrow(
      'Invalid publication catalog'
    );
  });
});
