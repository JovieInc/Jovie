import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
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
});
