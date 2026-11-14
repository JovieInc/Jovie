import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ComponentPropsWithoutRef, forwardRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';

const { runtimeUpdate } = vi.hoisted(() => ({
  runtimeUpdate: { available: false },
}));
// Expose the Next Link contract without starting a router in jsdom.
vi.mock('next/link', () => ({
  default: forwardRef<
    HTMLAnchorElement,
    ComponentPropsWithoutRef<'a'> & { readonly prefetch?: boolean }
  >(function TestLink({ prefetch, ...props }, ref) {
    return <a {...props} data-prefetch={String(prefetch)} ref={ref} />;
  }),
}));

vi.mock('./RuntimeUpdateProvider', () => ({
  useRuntimeUpdate: () => runtimeUpdate,
}));

import { SidebarInboxLink } from './SidebarInboxLink';

describe('central Inbox bell', () => {
  it('keeps pending work on view and keyboard navigation', async () => {
    const { container } = render(
      <SidebarInboxLink
        availability={{ state: 'available', pendingCount: 3 }}
      />
    );
    const link = screen.getByRole('link', {
      name: 'Inbox — 3 Items Need Attention',
    });
    expect(link.querySelector('svg')).toHaveClass(
      'size-(--app-shell-sidebar-icon-size)'
    );
    expect(link).toHaveClass('size-7', 'items-center', 'justify-center');
    expect(link).toHaveAttribute('href', '/app');
    expect(link).toHaveAttribute('data-prefetch', 'false');
    expect(link.querySelector('span')).toHaveClass(
      'absolute',
      'bottom-1',
      'right-1'
    );
    expect(link.querySelector('span')).not.toHaveClass('top-1');
    await userEvent.tab();
    expect(link).toHaveFocus();
    expect(link).toHaveAttribute('data-inbox-attention', 'available');
    await expectNoA11yViolations(container);
  });
  it('never marks the bell for an app update: the shell update pill owns it', () => {
    runtimeUpdate.available = true;
    try {
      render(
        <SidebarInboxLink availability={{ state: 'empty', pendingCount: 0 }} />
      );
      const link = screen.getByRole('link', { name: 'Inbox — all caught up' });
      expect(link).toHaveAttribute('data-inbox-attention', 'empty');
      expect(link.querySelector('[data-runtime-update]')).toBeNull();
      expect(link.querySelector('[data-inbox-unread]')).toBeNull();
    } finally {
      runtimeUpdate.available = false;
    }
  });

  it('keeps one unread dot for pending work, bottom right of the glyph', () => {
    render(
      <SidebarInboxLink
        availability={{ state: 'available', pendingCount: 3 }}
      />
    );
    const link = screen.getByRole('link', {
      name: 'Inbox — 3 Items Need Attention',
    });
    expect(link.querySelectorAll('[data-inbox-unread]')).toHaveLength(1);
    expect(link.querySelector('[data-inbox-unread]')).toHaveClass(
      'absolute',
      'bottom-1',
      'right-1',
      'bg-accent'
    );
  });

  it.each([
    [{ state: 'empty' as const, pendingCount: 0 }, 'Inbox — all caught up'],
    [{ state: 'unknown' as const, pendingCount: null }, 'Inbox'],
  ])('keeps the destination available for %s', async (availability, name) => {
    const { container } = render(
      <SidebarInboxLink availability={availability} />
    );
    const link = screen.getByRole('link', { name });
    expect(link).toHaveAttribute('href', '/app');
    expect(link.querySelector('span')).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('names a large backlog in full on the link', async () => {
    const { container } = render(
      <SidebarInboxLink
        availability={{ state: 'available', pendingCount: 12840 }}
      />
    );
    const link = screen.getByRole('link', {
      name: 'Inbox — 12840 Items Need Attention',
    });
    expect(link).toHaveClass('size-7');
    expect(link.querySelectorAll('[aria-hidden="true"]')).toHaveLength(2);
    await expectNoA11yViolations(container);
  });

  it('keeps the pending dot and name in a right-to-left sidebar', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <SidebarInboxLink
          availability={{ state: 'available', pendingCount: 3 }}
        />
      </div>
    );
    const link = screen.getByRole('link', {
      name: 'Inbox — 3 Items Need Attention',
    });
    expect(link).toHaveAttribute('data-inbox-attention', 'available');
    await expectNoA11yViolations(container);
  });

  it('keeps a lone pending item singular (JOV-9018 class)', () => {
    render(
      <SidebarInboxLink
        availability={{ state: 'available', pendingCount: 1 }}
      />
    );
    expect(
      screen.getByRole('link', { name: 'Inbox — 1 Item Needs Attention' })
    ).toBeInTheDocument();
  });

  it('names pending work without an update suffix even while an update is ready', () => {
    runtimeUpdate.available = true;
    try {
      render(
        <SidebarInboxLink
          availability={{ state: 'available', pendingCount: 1 }}
        />
      );
      const link = screen.getByRole('link', {
        name: 'Inbox — 1 Item Needs Attention',
      });
      expect(link.getAttribute('aria-label')).not.toMatch(/update/i);
    } finally {
      runtimeUpdate.available = false;
    }
  });
});
