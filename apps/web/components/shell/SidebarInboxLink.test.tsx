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
  it('keeps available runtime updates visible even when server work is empty', () => {
    runtimeUpdate.available = true;
    try {
      render(
        <SidebarInboxLink availability={{ state: 'empty', pendingCount: 0 }} />
      );
      const link = screen.getByRole('link', {
        name: 'Inbox — all caught up; app update available',
      });
      expect(link.querySelector('[data-runtime-update]')).toHaveClass(
        'absolute',
        'bottom-1',
        'right-1'
      );
      expect(link.querySelector('[data-runtime-update]')).not.toHaveClass(
        'top-1'
      );
    } finally {
      runtimeUpdate.available = false;
    }
  });

  it('consolidates pending work and runtime updates into one attention indicator', () => {
    runtimeUpdate.available = true;
    try {
      render(
        <SidebarInboxLink
          availability={{ state: 'available', pendingCount: 3 }}
        />
      );
      const link = screen.getByRole('link', {
        name: 'Inbox — 3 Items Need Attention; app update available',
      });
      expect(link.querySelectorAll('[data-runtime-update]')).toHaveLength(1);
      expect(link.querySelector('[data-runtime-update]')).toHaveClass(
        'bottom-1'
      );
    } finally {
      runtimeUpdate.available = false;
    }
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

  it('keeps the runtime-update dot independently labeled next to pending work', () => {
    runtimeUpdate.available = true;
    try {
      render(
        <SidebarInboxLink
          availability={{ state: 'available', pendingCount: 1 }}
        />
      );
      const link = screen.getByRole('link', {
        name: 'Inbox — 1 Item Needs Attention; app update available',
      });
      expect(link.querySelector('[data-runtime-update]')).not.toBeNull();
    } finally {
      runtimeUpdate.available = false;
    }
  });
});
