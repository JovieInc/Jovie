import { render, screen } from '@testing-library/react';
import type { ComponentPropsWithoutRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  renderDashboardNav,
  resetDashboardNavTestMocks,
} from '@/tests/utils/dashboard-nav-test-support';

vi.mock('next/link', async () => {
  const { forwardRef } = await import('react');
  return {
    default: forwardRef<
      HTMLAnchorElement,
      ComponentPropsWithoutRef<'a'> & { readonly prefetch?: boolean }
    >(function TestLink({ prefetch, ...props }, ref) {
      return <a {...props} data-prefetch={String(prefetch)} ref={ref} />;
    }),
  };
});

describe('DashboardNav route warming', () => {
  afterEach(() => resetDashboardNavTestMocks());

  it('fully prefetches every canonical dynamic customer route', () => {
    renderDashboardNav({ renderFn: render });

    for (const label of [
      'Inbox',
      'New Chat',
      'Library',
      'Contacts',
      'Calendar',
      'Tasks',
    ]) {
      expect(screen.getByRole('link', { name: label })).toHaveAttribute(
        'data-prefetch',
        'true'
      );
    }
  });
});
