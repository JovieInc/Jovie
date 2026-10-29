import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ComponentPropsWithoutRef, forwardRef } from 'react';
import { describe, expect, it, vi } from 'vitest';

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
    render(
      <SidebarInboxLink
        availability={{ state: 'available', pendingCount: 3 }}
      />
    );
    const link = screen.getByRole('link', {
      name: 'Inbox — 3 items need attention',
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
        name: 'Inbox — 3 items need attention; app update available',
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
  ])('keeps the destination available for %s', (availability, name) => {
    render(<SidebarInboxLink availability={availability} />);
    const link = screen.getByRole('link', { name });
    expect(link).toHaveAttribute('href', '/app');
    expect(link.querySelector('span')).toBeNull();
  });
});
