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
    // JOV-8968: the bell is a passive dot — no count in the label.
    const link = screen.getByRole('link', {
      name: 'Inbox — Items Need Attention',
    });
    expect(link).toHaveAttribute('href', '/app');
    expect(link).toHaveAttribute('data-prefetch', 'false');
    await userEvent.tab();
    expect(link).toHaveFocus();
    expect(link).toHaveAttribute('data-inbox-attention', 'available');
    expect(link.querySelector('[data-inbox-attention-dot]')).not.toBeNull();
    expect(link.textContent).not.toMatch(/\d/);
  });
  it('keeps available runtime updates visible even when server work is empty', () => {
    runtimeUpdate.available = true;
    try {
      render(
        <SidebarInboxLink availability={{ state: 'empty', pendingCount: 0 }} />
      );
      const link = screen.getByRole('link', {
        name: 'Inbox — All Caught Up; App Update Available',
      });
      // The Inbox itself renders the update card, so the dot stays honest.
      expect(link.querySelector('[data-runtime-update]')).not.toBeNull();
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
        name: 'Inbox — Items Need Attention; App Update Available',
      });
      expect(link.querySelectorAll('[data-runtime-update]')).toHaveLength(1);
    } finally {
      runtimeUpdate.available = false;
    }
  });

  it('hides the dot when the Inbox is empty (JOV-8968)', () => {
    runtimeUpdate.available = false;
    render(
      <SidebarInboxLink availability={{ state: 'empty', pendingCount: 0 }} />
    );
    const link = screen.getByRole('link', { name: 'Inbox — All Caught Up' });
    expect(link.querySelector('[data-inbox-attention-dot]')).toBeNull();
    expect(link.querySelector('[data-runtime-update]')).toBeNull();
  });

  it.each([
    [{ state: 'available' as const, pendingCount: 1 }, true],
    [{ state: 'available' as const, pendingCount: 0 }, true],
    [{ state: 'empty' as const, pendingCount: 0 }, false],
    [{ state: 'unknown' as const, pendingCount: null }, false],
  ])(
    'reads the shared Inbox source for %s (JOV-8968)',
    (availability, dotVisible) => {
      runtimeUpdate.available = false;
      render(<SidebarInboxLink availability={availability} />);
      const link = screen.getByRole('link', { name: /^Inbox/ });
      expect(Boolean(link.querySelector('[data-inbox-attention-dot]'))).toBe(
        dotVisible
      );
      expect(link.getAttribute('data-inbox-attention')).toBe(
        availability.state
      );
    }
  );

  it.each([
    [{ state: 'empty' as const, pendingCount: 0 }, 'Inbox — All Caught Up'],
    [
      { state: 'unknown' as const, pendingCount: null },
      'Inbox — Status Unavailable',
    ],
  ])('keeps the destination available for %s', (availability, name) => {
    render(<SidebarInboxLink availability={availability} />);
    expect(screen.getByRole('link', { name })).toHaveAttribute('href', '/app');
  });
});
