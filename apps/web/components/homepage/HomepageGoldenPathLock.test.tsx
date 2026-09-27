import { render, screen } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { HomepageEditorialHero } from '@/components/homepage/HomepageEditorialHero';
import { HomepageNoScriptContent } from '@/components/homepage/HomepageNoScriptContent';
import { FEATURE_FLAGS } from '@/lib/flags/marketing-static';
import { evaluateHomepageHtml } from '../../../../scripts/lib/golden-path-lock.mjs';

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

/**
 * Production ships WAITLIST_ENABLED. JOV-5085 still requires the JOV-5864
 * name search in the homepage HTML, with a /start handoff.
 */
describe('homepage golden-path lock', () => {
  it('keeps Search your name → Find me and a /start handoff while the waitlist flag is on', () => {
    expect(FEATURE_FLAGS.WAITLIST_ENABLED).toBe(true);

    const hero = render(
      <HomepageEditorialHero
        headline='Control how the world sees you.'
        support='Find what the internet knows. Turn it into relationships.'
        search={{ placeholder: 'Search your name', action: 'Find me' }}
      />
    );
    const fallback = renderToStaticMarkup(<HomepageNoScriptContent />);
    const html = `${hero.container.innerHTML}${fallback}`;

    expect(screen.getByRole('combobox')).toHaveAttribute(
      'placeholder',
      'Search your name'
    );
    expect(
      screen.getByRole('button', { name: 'Find me', exact: true })
    ).toBeEnabled();
    expect(
      screen.queryByRole('link', { name: /Request access|Get started/ })
    ).not.toBeInTheDocument();
    expect(evaluateHomepageHtml(html)).toMatchObject({
      id: 'homepage-cta',
      ok: true,
    });
  });
});
