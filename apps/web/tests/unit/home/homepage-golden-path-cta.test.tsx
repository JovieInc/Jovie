import { render, screen } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { HomepageEditorialHero } from '@/components/homepage/HomepageEditorialHero';
import { HomepageNoScriptContent } from '@/components/homepage/HomepageNoScriptContent';
import { HERO_COPY } from '@/components/homepage/intent';
import { FEATURE_FLAGS } from '@/lib/flags/marketing-static';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('@/lib/queries/useArtistSearchQuery', () => ({
  useArtistSearchQuery: () => ({
    results: [],
    state: 'idle',
    search: vi.fn(),
    clear: vi.fn(),
  }),
}));

describe('homepage golden-path CTA', () => {
  it('keeps Search your name → Find me and a /start handoff while the waitlist gate is on', () => {
    expect(FEATURE_FLAGS.WAITLIST_ENABLED).toBe(true);

    render(
      <HomepageEditorialHero
        headingId='home-hero-heading'
        headline={HERO_COPY.headline}
        support={HERO_COPY.subhead}
        search={HERO_COPY.search}
      />
    );

    expect(screen.getByRole('combobox')).toHaveAttribute(
      'placeholder',
      'Search your name'
    );
    expect(screen.getByRole('button', { name: 'Find me' })).toBeEnabled();
    expect(screen.queryByRole('link', { name: 'Request access' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Get started' })).toBeNull();

    const html = `${document.body.innerHTML}${renderToStaticMarkup(
      <HomepageNoScriptContent />
    )}`;
    expect(html).toContain('Search your name');
    expect(html).toContain('Find me');
    expect(html).toMatch(/href="\/start"/);
    expect(html).not.toContain('Request access');
    expect(html).not.toContain('Get started');
  });
});
