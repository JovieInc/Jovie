import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { HomepageClose } from '@/components/homepage/HomepageClose';
import { HomepageEditorialHero } from '@/components/homepage/HomepageEditorialHero';
import { HomepageNoScriptContent } from '@/components/homepage/HomepageNoScriptContent';
import { HERO_COPY } from '@/components/homepage/intent';
import { FEATURE_FLAGS } from '@/lib/flags/marketing-static';
import { evaluateHomepageHtml } from '../../../../../scripts/lib/golden-path-lock.mjs';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('@/lib/analytics', () => ({
  page: vi.fn(),
  track: vi.fn(),
}));

vi.mock('@/lib/queries/useArtistSearchQuery', () => ({
  useArtistSearchQuery: () => ({
    results: [],
    state: 'idle',
    search: vi.fn(),
    clear: vi.fn(),
  }),
}));

/**
 * JOV-5085 / JOV-5864: production keeps WAITLIST_ENABLED on. That gate must
 * not remove the certified homepage conversion the prod probe reads from HTML.
 */
describe('homepage golden-path lock', () => {
  it('keeps Search your name → Find me and a /start handoff while the waitlist gate is on', () => {
    expect(FEATURE_FLAGS.WAITLIST_ENABLED).toBe(true);

    const { container } = render(
      <>
        <HomepageEditorialHero
          headingId='home-hero-heading'
          headline={HERO_COPY.headline}
          support={HERO_COPY.subhead}
          search={HERO_COPY.search}
        />
        <HomepageClose />
        <HomepageNoScriptContent />
      </>
    );

    const check = evaluateHomepageHtml(container.innerHTML);
    expect(check).toMatchObject({
      id: 'homepage-cta',
      ok: true,
    });
    expect(container.innerHTML).not.toContain('Request access');
    expect(container.innerHTML).not.toContain('Get started');
    expect(container.innerHTML).not.toContain('/signup');
  });
});
