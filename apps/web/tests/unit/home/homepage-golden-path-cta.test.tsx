import { render, screen } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { HomepageEditorialHero } from '@/components/homepage/HomepageEditorialHero';
import { HomepageNoScriptContent } from '@/components/homepage/HomepageNoScriptContent';
import { evaluateHomepageHtml } from '../../../../../scripts/lib/golden-path-lock.mjs';

vi.mock('@/lib/flags/marketing-static', () => ({
  FEATURE_FLAGS: { WAITLIST_ENABLED: true },
}));

vi.mock('@/components/homepage/homepage-analytics', () => ({
  trackHomepageEvent: vi.fn(),
}));

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

describe('golden path homepage CTA (JOV-5085)', () => {
  it('keeps Search your name → Find me and a /start handoff while waitlist is on', () => {
    render(
      <HomepageEditorialHero
        headline='Control how the world sees you.'
        support='Find what the internet knows. Turn it into relationships.'
        search={{ placeholder: 'Search your name', action: 'Find me' }}
      />
    );

    const check = evaluateHomepageHtml(
      `${document.body.innerHTML}${renderToStaticMarkup(<HomepageNoScriptContent />)}`
    );

    expect(check).toEqual({
      id: 'homepage-cta',
      ok: true,
      reason:
        'found name search "Search your name" → "Find me" and /start handoff',
    });
    expect(screen.getByPlaceholderText('Search your name')).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Find me' })).toBeEnabled();
    expect(screen.queryByRole('link', { name: 'Request access' })).toBeNull();
    expect(screen.queryByText('Get started')).toBeNull();
  });
});
