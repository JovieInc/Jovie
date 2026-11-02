import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  HOMEPAGE_MOMENT_IDS,
  HOMEPAGE_MOMENT_NEXT_RELEASE,
  HOMEPAGE_MOMENT_RELEASE,
  HOMEPAGE_MOMENT_SUBSCRIBERS,
} from './homepage-moment-fixtures';

const query = vi.hoisted(() => ({ value: '' }));

vi.mock('next/navigation', async importOriginal => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  useSearchParams: () => new URLSearchParams(query.value),
  usePathname: () => '/demo/showcase/homepage-moment',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));
vi.mock('@/lib/analytics', () => ({ track: vi.fn(), page: vi.fn() }));

const { DemoHomepageMomentSurface } = await import(
  './DemoHomepageMomentSurface'
);
const { DemoHomepageEmailMoment } = await import('./DemoHomepageEmailMoment');

describe('homepage moment fixtures', () => {
  it("uses Tim White's real releases for the link and the release email", () => {
    expect(HOMEPAGE_MOMENT_RELEASE.title).toBe('Take Me Over');
    expect(HOMEPAGE_MOMENT_NEXT_RELEASE.title).toBe('The Deep End');
    expect(HOMEPAGE_MOMENT_RELEASE.artworkUrl).toMatch(/^\/img\/releases\//);
  });

  it('keeps subscriber rows generic: masked addresses, no names, recent', () => {
    expect(HOMEPAGE_MOMENT_SUBSCRIBERS.length).toBeGreaterThan(0);
    for (const row of HOMEPAGE_MOMENT_SUBSCRIBERS) {
      expect(row.email).toMatch(/^[a-z]•+@[a-z.]+$/);
      expect(row.displayName).toBe(row.email);
      const ageMs = Date.now() - Date.parse(row.lastSeenAt ?? '');
      expect(ageMs).toBeGreaterThan(0);
      expect(ageMs).toBeLessThan(24 * 3_600_000);
    }
  });
});

describe('DemoHomepageMomentSurface', () => {
  afterEach(() => {
    query.value = '';
  });

  it('falls back to the smart link for an unknown moment', () => {
    query.value = 'moment=nope';
    render(<DemoHomepageMomentSurface />);
    expect(
      screen.getByTestId('homepage-moment-smart-link')
    ).toBeInTheDocument();
    expect(screen.getAllByText(HOMEPAGE_MOMENT_RELEASE.title).length).toBe(1);
  });

  it('declares every moment the product shots capture', () => {
    expect(HOMEPAGE_MOMENT_IDS).toEqual([
      'smart-link',
      'capture',
      'list',
      'catalog',
    ]);
  });
});

describe('DemoHomepageEmailMoment', () => {
  it('frames the given email HTML in a titled iframe', () => {
    const html = '<!DOCTYPE html><html><body>Out now</body></html>';
    render(<DemoHomepageEmailMoment html={html} />);
    const frame = screen.getByTitle('Release day email');
    expect(frame).toHaveAttribute('srcdoc', html);
    expect(frame).toHaveAttribute('data-testid', 'homepage-moment-email');
  });
});
