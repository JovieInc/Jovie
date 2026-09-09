import { render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { APP_ROUTES } from '@/constants/routes';
import {
  renderDashboardNav,
  resetDashboardNavTestMocks,
} from '@/tests/utils/dashboard-nav-test-support';

const runtimeUpdateState = vi.hoisted(() => ({ available: false }));
vi.mock('@/components/shell/RuntimeUpdateProvider', () => ({
  useRuntimeUpdate: () =>
    runtimeUpdateState.available ? { available: true } : null,
}));

vi.mock('next/link', () => ({
  default: React.forwardRef<
    HTMLAnchorElement,
    React.ComponentPropsWithoutRef<'a'> & { readonly prefetch?: boolean }
  >(function TestLink({ prefetch, ...props }, ref) {
    return <a {...props} data-prefetch={String(prefetch)} ref={ref} />;
  }),
}));

describe('DashboardNav route warming', () => {
  afterEach(() => {
    runtimeUpdateState.available = false;
    resetDashboardNavTestMocks();
  });

  it('leaves Inbox to the brand-row bell without removing other destinations', () => {
    renderDashboardNav({ renderFn: render, headerOwnsInbox: true });
    expect(
      screen.queryByRole('link', { name: 'Inbox' })
    ).not.toBeInTheDocument();
    for (const label of [
      'New Chat',
      'Library',
      'Contacts',
      'Calendar',
      'Tasks',
    ]) {
      expect(screen.getByRole('link', { name: label })).toBeInTheDocument();
    }
  });

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

  it('shows runtime update attention on the existing Inbox bell while preserving opportunity counts', () => {
    runtimeUpdateState.available = true;
    const pending = renderDashboardNav({
      renderFn: render,
      overrides: {
        inboxNavigation: { state: 'available', pendingCount: 3 },
      },
    });
    expect(
      pending.getByRole('link', { name: 'Inbox — App Update Available' })
    ).toHaveAttribute('href', APP_ROUTES.DASHBOARD);
    expect(
      pending.getByRole('status', { name: '3 pending items' })
    ).toHaveTextContent('3');
    pending.unmount();

    const updateOnly = renderDashboardNav({
      renderFn: render,
      overrides: {
        inboxNavigation: { state: 'empty', pendingCount: 0 },
      },
    });
    const updateLink = updateOnly.getByRole('link', {
      name: 'Inbox — App Update Available',
    });
    expect(updateLink).toHaveAttribute('data-inbox-attention', 'available');
    expect(
      updateLink.querySelector('[data-inbox-runtime-update]')
    ).not.toBeNull();
    updateOnly.unmount();

    runtimeUpdateState.available = false;
    const caughtUp = renderDashboardNav({
      renderFn: render,
      overrides: {
        inboxNavigation: { state: 'empty', pendingCount: 0 },
      },
    });
    const link = caughtUp.getByRole('link', { name: 'Inbox' });
    expect(link).toHaveAttribute('data-inbox-attention', 'empty');
    expect(link.querySelector('[data-inbox-runtime-update]')).toBeNull();
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
