import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { APP_ROUTES } from '@/constants/routes';
import { expectNoA11yViolations } from '@/tests/utils/a11y';

// Next's app router instance is stable across renders, so the stub is too.
const { prefetch, router } = vi.hoisted(() => {
  const prefetch = vi.fn();
  return { prefetch, router: { prefetch } };
});

vi.mock('next/navigation', async importOriginal => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  useRouter: () => router,
}));

import { AuthRoutePrefetch } from './AuthRoutePrefetch';

describe('AuthRoutePrefetch', () => {
  beforeEach(() => {
    prefetch.mockClear();
  });

  it('warms the auth destination once on mount and renders nothing', async () => {
    const { container } = render(
      <main>
        <h1>Request access</h1>
        <AuthRoutePrefetch href={APP_ROUTES.SIGNIN} />
      </main>
    );

    expect(prefetch).toHaveBeenCalledOnce();
    expect(prefetch).toHaveBeenCalledWith(APP_ROUTES.SIGNIN);
    expect(container.querySelector('main')?.children).toHaveLength(1);
    await expectNoA11yViolations(container);
  });

  it('prefetches again only when the destination changes', async () => {
    const { container, rerender } = render(
      <AuthRoutePrefetch href={APP_ROUTES.SIGNIN} />
    );
    rerender(<AuthRoutePrefetch href={APP_ROUTES.SIGNIN} />);
    expect(prefetch).toHaveBeenCalledTimes(1);

    rerender(<AuthRoutePrefetch href={APP_ROUTES.START} />);
    expect(prefetch).toHaveBeenCalledTimes(2);
    expect(prefetch).toHaveBeenLastCalledWith(APP_ROUTES.START);
    expect(container).toBeEmptyDOMElement();
    await expectNoA11yViolations(container);
  });
});
