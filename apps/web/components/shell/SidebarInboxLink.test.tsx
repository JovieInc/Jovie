import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

const { runtimeUpdate } = vi.hoisted(() => ({
  runtimeUpdate: { available: false },
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
      name: 'Inbox — 3 Items Need Attention',
    });
    expect(link).toHaveAttribute('href', '/app');
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
        name: 'Inbox — All Caught Up; App Update Available',
      });
      expect(link.querySelector('[data-runtime-update]')).not.toBeNull();
    } finally {
      runtimeUpdate.available = false;
    }
  });
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
