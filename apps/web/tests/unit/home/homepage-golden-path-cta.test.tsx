import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { HomepageEditorialHero } from '@/components/homepage/HomepageEditorialHero';
import { HomepageNoScriptContent } from '@/components/homepage/HomepageNoScriptContent';
import { HERO_COPY } from '@/components/homepage/intent';
import {
  HOMEPAGE_CERTIFIED_EVENTS,
  HOMEPAGE_CERTIFIED_OPTIMIZATION_CONTRACT,
} from '@/data/homepageCertifiedOptimization';
import { FEATURE_FLAGS } from '@/lib/flags/marketing-static';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('@/lib/analytics', () => ({
  track: vi.fn(),
  page: vi.fn(),
}));

vi.mock('@/lib/queries/useArtistSearchQuery', () => ({
  useArtistSearchQuery: () => ({
    results: [],
    state: 'idle',
    search: vi.fn(),
    searchImmediate: vi.fn(),
    clear: vi.fn(),
  }),
}));

describe('JOV-5085 homepage golden path CTA', () => {
  it('keeps Search your name → Find me and a /start handoff while the waitlist gate is on', () => {
    expect(FEATURE_FLAGS.WAITLIST_ENABLED).toBe(true);
    expect(HOMEPAGE_CERTIFIED_OPTIMIZATION_CONTRACT.outcome).toBe(
      HOMEPAGE_CERTIFIED_EVENTS.SEARCH_SUBMITTED
    );

    const { container } = render(
      <>
        <HomepageEditorialHero
          headingId='home-hero-heading'
          headline={HERO_COPY.headline}
          support={HERO_COPY.subhead}
          search={HERO_COPY.search}
        />
        <HomepageNoScriptContent />
      </>
    );
    const html = container.innerHTML;

    expect(screen.getByPlaceholderText('Search your name')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Find me' })).toBeEnabled();
    expect(html).toContain('Search your name');
    expect(html).toContain('Find me');
    expect(html).toMatch(/href="\/start"/);
    expect(html).not.toContain('Request access');
    expect(html).not.toContain('Get started');
    expect(html).not.toContain('Too many messages');
  });
});
