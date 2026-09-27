// JOV-5085 / JOV-5864: production replaced the locked homepage conversion
// with Request access while WAITLIST_ENABLED stayed true (JOV-6537). The
// prod probe reads raw HTML for "Search your name", "Find me", and a /start
// handoff. This renders the real flag, not a waitlist-off mock.

import { render, screen } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { HomepageEditorialHero } from '@/components/homepage/HomepageEditorialHero';
import { HomepageNoScriptContent } from '@/components/homepage/HomepageNoScriptContent';
import { HERO_COPY } from '@/components/homepage/intent';
import { FEATURE_FLAGS } from '@/lib/flags/marketing-static';
import { evaluateHomepageHtml } from '../../../../../scripts/lib/golden-path-lock.mjs';

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

vi.mock('@/lib/analytics', () => ({
  track: vi.fn(),
  page: vi.fn(),
}));

describe('homepage golden-path lock', () => {
  it('keeps Search your name → Find me and a /start handoff while the waitlist gate is on', () => {
    expect(FEATURE_FLAGS.WAITLIST_ENABLED).toBe(true);

    const { container } = render(
      <HomepageEditorialHero
        headingId='home-hero-heading'
        headline={HERO_COPY.headline}
        support={HERO_COPY.subhead}
        search={HERO_COPY.search}
      />
    );
    const html = `${container.innerHTML}${renderToStaticMarkup(
      <HomepageNoScriptContent />
    )}`;

    expect(evaluateHomepageHtml(html)).toMatchObject({
      id: 'homepage-cta',
      ok: true,
    });
    expect(screen.getByPlaceholderText('Search your name')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Find me' })).toBeEnabled();
    expect(
      screen.queryByRole('link', { name: 'Request access' })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Get started' })
    ).not.toBeInTheDocument();
    expect(html).not.toContain('Request access');
    expect(html).not.toContain('Get started');
  });
});
