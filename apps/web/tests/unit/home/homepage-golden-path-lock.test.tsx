import { fireEvent, render, screen } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { HomepageEditorialHero } from '@/components/homepage/HomepageEditorialHero';
import { HomepageNoScriptContent } from '@/components/homepage/HomepageNoScriptContent';
import { HERO_COPY } from '@/components/homepage/intent';
import { FEATURE_FLAGS } from '@/lib/flags/marketing-static';
import { evaluateHomepageHtml } from '../../../../../scripts/lib/golden-path-lock.mjs';

const push = vi.hoisted(() => vi.fn());

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
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

describe('homepage golden path lock (JOV-5085)', () => {
  it('keeps Search your name → Find me → /start while the waitlist gate is on', () => {
    expect(FEATURE_FLAGS.WAITLIST_ENABLED).toBe(true);

    const view = render(
      <HomepageEditorialHero
        headline={HERO_COPY.headline}
        support={HERO_COPY.subhead}
        search={HERO_COPY.search}
      />
    );

    expect(screen.getByPlaceholderText('Search your name')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Find me' })).toBeEnabled();
    expect(screen.queryByRole('link', { name: 'Request access' })).toBeNull();
    expect(screen.queryByText('Get started')).toBeNull();

    fireEvent.change(screen.getByRole('combobox'), {
      target: { value: 'Taylor Swift' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Find me' }));

    expect(push).toHaveBeenCalledTimes(1);
    const destination = String(push.mock.calls[0]?.[0]);
    expect(destination.startsWith('/start?')).toBe(true);
    expect(destination).toContain('starter_prompt=');

    const html = `${view.container.innerHTML}${renderToStaticMarkup(
      <HomepageNoScriptContent />
    )}`;
    const check = evaluateHomepageHtml(html);
    expect(check).toMatchObject({ id: 'homepage-cta', ok: true });
  });
});
