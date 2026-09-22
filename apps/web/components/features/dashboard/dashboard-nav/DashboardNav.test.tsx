import { render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  renderDashboardNav,
  resetDashboardNavTestMocks,
} from '@/tests/utils/dashboard-nav-test-support';

vi.mock('next/link', () => ({
  default: React.forwardRef<
    HTMLAnchorElement,
    React.ComponentPropsWithoutRef<'a'> & { readonly prefetch?: boolean }
  >(function TestLink({ prefetch, ...props }, ref) {
    return <a {...props} data-prefetch={String(prefetch)} ref={ref} />;
  }),
}));

describe('DashboardNav route warming', () => {
  afterEach(() => resetDashboardNavTestMocks());

  it('fully prefetches every canonical dynamic customer route', () => {
    renderDashboardNav({ renderFn: render });

    for (const label of [
      'Inbox',
      'New Chat',
      'Library',
      'Contacts',
      'Presence',
    ]) {
      expect(screen.getByRole('link', { name: label })).toHaveAttribute(
        'data-prefetch',
        'true'
      );
    }
    expect(
      screen.queryByRole('link', { name: 'Calendar' })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Tasks' })
    ).not.toBeInTheDocument();
  });

  // JOV-6181: the rail's New Chat affordance must never carry the terminal
  // label fade — on the compact create treatment it sheared the trailing "t"
  // ("Chat" -> "Cha") with rail space free. The canonical rail renders the
  // action icon-only inside the search slot; this walks the real production
  // tree so any future labelled New Chat row stays unmasked.
  it('keeps the New Chat affordance unmasked in the production rail', () => {
    const { container } = renderDashboardNav({ renderFn: render });

    const newChatAction = screen.getByRole('link', { name: 'New Chat' });
    expect(newChatAction).toBeInTheDocument();
    expect(newChatAction).toHaveAttribute('aria-label', 'New Chat');

    const nav = container.querySelector('nav');
    expect(nav).not.toBeNull();
    for (const el of Array.from(nav?.querySelectorAll('*') ?? [])) {
      if (el.textContent?.trim() === 'New Chat') {
        expect(el.className).not.toContain('mask-image');
      }
    }
  });
});
