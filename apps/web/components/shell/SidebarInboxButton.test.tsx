import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { SidebarInboxButton } from './SidebarInboxButton';

describe('central Inbox bell', () => {
  it('keeps pending work on view and keyboard navigation', async () => {
    render(
      <SidebarInboxButton
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
  it.each([
    [{ state: 'empty' as const, pendingCount: 0 }, 'Inbox — All Caught Up'],
    [
      { state: 'unknown' as const, pendingCount: null },
      'Inbox — Status Unavailable',
    ],
  ])('keeps the destination available for %s', (availability, name) => {
    render(<SidebarInboxButton availability={availability} />);
    expect(screen.getByRole('link', { name })).toHaveAttribute('href', '/app');
  });
});
