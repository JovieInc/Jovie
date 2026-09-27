import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { HomepageClose } from '@/components/homepage/HomepageClose';
import { HomepageEditorialHero } from '@/components/homepage/HomepageEditorialHero';
import { HomepageNoScriptContent } from '@/components/homepage/HomepageNoScriptContent';
import { HERO_COPY } from '@/components/homepage/intent';
import { FEATURE_FLAGS } from '@/lib/flags/marketing-static';
import { evaluateHomepageHtml } from '../../../../../scripts/lib/golden-path-lock.mjs';

vi.mock('next/navigation', () => ({
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

describe('homepage golden-path CTA (JOV-5085)', () => {
  it('keeps Search your name → Find me → /start while the waitlist gate is on', () => {
    expect(FEATURE_FLAGS.WAITLIST_ENABLED).toBe(true);

    const { container } = render(
      <>
        <HomepageEditorialHero
          headline={HERO_COPY.headline}
          support={HERO_COPY.subhead}
          search={HERO_COPY.search}
        />
        <HomepageClose />
        <HomepageNoScriptContent />
      </>
    );

    expect(screen.getByPlaceholderText('Search your name')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Find me' })).toBeEnabled();
    expect(
      screen.queryByRole('link', { name: 'Request access' })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Get started' })
    ).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Find me' })).toHaveAttribute(
      'href',
      '/start'
    );

    expect(evaluateHomepageHtml(container.innerHTML)).toMatchObject({
      id: 'homepage-cta',
      ok: true,
    });
  });
});
