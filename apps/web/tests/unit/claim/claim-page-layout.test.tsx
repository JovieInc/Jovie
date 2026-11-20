import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/cookies/banner-initial-visibility.server', () => ({
  resolveInitialCookieBannerVisible: vi.fn(async () => false),
}));
vi.mock('@/app/claim/ClaimArtistSearch', () => ({
  ClaimArtistSearch: () => <div data-testid='claim-artist-search' />,
}));

import ClaimPage, { metadata } from '@/app/claim/page';
import { APP_NAME } from '@/constants/app';

async function renderClaimPage() {
  render(await ClaimPage({ searchParams: Promise.resolve({}) }));
}

describe('claim page layout', () => {
  it('leaves the brand suffix to the root title template', () => {
    // The root layout appends ` | ${APP_NAME}`, so the page title must not.
    expect(metadata.title).toBe('Claim your artist profile');
    expect(String(metadata.title)).not.toContain(APP_NAME);
  });

  it('pins the claim card to the top so search results do not move it', async () => {
    await renderClaimPage();
    const main = screen.getByRole('main');
    // Vertical centering re-centers the card every time results change height.
    expect(main.className).not.toContain('items-center');
  });

  it('scrolls itself, because html and body never scroll on this route', async () => {
    await renderClaimPage();
    const classes = screen.getByRole('main').className.split(' ');
    // A min-height box grows instead of scrolling, so six results on a short
    // phone pushed the card's bottom and its button out of reach.
    expect(classes).toContain('h-svh');
    expect(classes).toContain('overflow-y-auto');
  });

  it('aligns the heading with the search body padding', async () => {
    await renderClaimPage();
    const heading = screen.getByRole('heading', {
      level: 1,
      name: 'Claim Your Artist Profile',
    });
    const header = heading.closest('div')?.parentElement;
    expect(header?.className).toContain('px-5');
    expect(header?.className).toContain('sm:px-6');
    expect(heading.className).toContain('text-base');
  });
});
