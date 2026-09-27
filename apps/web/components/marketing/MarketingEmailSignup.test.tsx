import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { isEditorialFooterCtaPath } from '@/lib/marketing/editorial-content-routes';
import { MarketingEmailSignup } from './MarketingEmailSignup';

const route = vi.hoisted(() => ({ pathname: '/blog' as string | null }));
vi.mock('next/navigation', () => ({ usePathname: () => route.pathname }));
vi.mock('@/app/(marketing)/changelog/ChangelogEmailSignup', () => ({
  ChangelogEmailSignup: ({ source }: { source: string }) => (
    <div data-testid='signup'>{source}</div>
  ),
}));

describe('MarketingEmailSignup placement', () => {
  it.each([
    '/blog',
    '/blog/an-article',
    '/blog/category/music',
    '/blog/authors/tim',
    '/engineering',
    '/engineering/an-article',
    '/changelog/a-release',
    '/about',
    '/support',
    '/pricing',
    '/pay',
    '/artist-profiles',
    '/developers',
  ])('offers product updates on %s with route attribution', pathname => {
    route.pathname = pathname;
    render(<MarketingEmailSignup />);
    expect(screen.getByTestId('signup')).toHaveTextContent(
      `marketing:${pathname}`
    );
  });
  it.each([
    null,
    '/changelog',
    '/engineering/preview',
    '/engineering/preview/article',
    '/renders',
    '/investors',
    '/demo/video',
  ])('avoids duplicate or internal signup on %s', pathname => {
    route.pathname = pathname;
    const { container } = render(<MarketingEmailSignup />);
    expect(container).toBeEmptyDOMElement();
  });

  // MarketingFooter reads the same predicate to suppress its generic
  // footer CTA on these routes (marketing routes spec, 2026-09-26) — keep
  // both consumers locked to the one shared source of truth.
  it.each([
    '/blog',
    '/blog/an-article',
    '/blog/category/music',
    '/engineering',
    '/engineering/an-article',
    '/changelog/a-release',
  ])(
    'is the shared editorial predicate MarketingFooter also reads for %s',
    pathname => {
      expect(isEditorialFooterCtaPath(pathname)).toBe(true);
    }
  );

  it.each([
    '/changelog',
    '/engineering/preview',
    '/engineering/preview/article',
  ])('excludes %s from the shared editorial predicate', pathname => {
    expect(isEditorialFooterCtaPath(pathname)).toBe(false);
  });
});
