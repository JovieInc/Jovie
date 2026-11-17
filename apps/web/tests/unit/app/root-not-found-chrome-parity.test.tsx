import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

/**
 * The root 404 draws its header and footer from server-only twins
 * (`components/organisms/RootNotFound*.tsx`) so the boundary ships no
 * marketing client JS to every route. A visitor must not be able to tell:
 * these cases hold the twins' markup equal to the real marketing chrome on an
 * unknown path. When one of them fails, apply the same markup change to the
 * twin.
 */
vi.mock('next/navigation', async importOriginal => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  usePathname: () => '/a-page-that-does-not-exist',
}));

vi.mock('@/lib/analytics', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/analytics')>()),
  track: vi.fn(),
}));

import { RootNotFoundFooter } from '@/components/organisms/RootNotFoundFooter';
import { RootNotFoundHeader } from '@/components/organisms/RootNotFoundHeader';
import { MarketingFooter } from '@/components/site/MarketingFooter';
import { MarketingHeader } from '@/components/site/MarketingHeader';

function markupOf(element: React.ReactElement): string {
  const { container, unmount } = render(element);
  const markup = container.innerHTML;
  unmount();
  return markup;
}

describe('root not-found chrome parity', () => {
  it('draws the same header as the minimal marketing header', () => {
    const twin = markupOf(<RootNotFoundHeader />);

    expect(twin).toContain('data-testid="header-nav"');
    expect(twin).toBe(
      markupOf(<MarketingHeader logoSize='xs' variant='minimal' />)
    );
  });

  it('draws the same footer as the marketing footer on an unknown path', () => {
    const twin = markupOf(<RootNotFoundFooter />);

    expect(twin).toContain('data-footer-variant="expanded"');
    expect(twin).toContain('data-testid="marketing-footer-cta"');
    expect(twin).toBe(markupOf(<MarketingFooter />));
  });
});
