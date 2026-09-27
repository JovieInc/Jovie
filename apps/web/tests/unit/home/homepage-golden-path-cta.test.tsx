import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HomepageEditorialHero } from '@/components/homepage/HomepageEditorialHero';
import { MarketingPageContractMarkers } from '@/components/site/MarketingPageContractMarkers';
import { FEATURE_FLAGS } from '@/lib/flags/marketing-static';

const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
  usePathname: () => '/',
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

const START_HREF = /href\s*=\s*["'][^"']*\/start(?:[?"']|\/)/i;

function renderCertifiedHomepage() {
  return render(
    <>
      <HomepageEditorialHero
        headingId='home-hero-heading'
        headline='Control how the world sees you.'
        support='Find what the internet knows. Turn it into relationships.'
        search={{ placeholder: 'Search your name', action: 'Find me' }}
      />
      <MarketingPageContractMarkers />
    </>
  );
}

describe('golden-path homepage CTA (JOV-5085)', () => {
  beforeEach(() => {
    mockPush.mockClear();
  });

  it('keeps Search your name → Find me and a /start handoff while the waitlist gate is on', () => {
    expect(FEATURE_FLAGS.WAITLIST_ENABLED).toBe(true);
    renderCertifiedHomepage();

    expect(screen.getByRole('combobox')).toHaveAttribute(
      'placeholder',
      'Search your name'
    );
    expect(screen.getByRole('button', { name: 'Find me' })).toBeEnabled();
    expect(
      screen.queryByRole('link', { name: 'Request access' })
    ).not.toBeInTheDocument();

    const html = document.body.innerHTML;
    expect(html).toContain('Search your name');
    expect(html).toContain('Find me');
    expect(html).toMatch(START_HREF);
  });

  it('sends a typed name to /start', () => {
    renderCertifiedHomepage();
    fireEvent.change(screen.getByRole('combobox'), {
      target: { value: 'Ada' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Find me' }));
    expect(mockPush).toHaveBeenCalledWith(expect.stringMatching(/^\/start\?/));
  });
});
