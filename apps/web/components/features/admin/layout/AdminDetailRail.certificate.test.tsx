import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { KeyboardEvent, ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { DrawerSection } from '@/components/molecules/drawer/DrawerSection';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { AdminDetailRail } from './AdminDetailRail';

vi.mock('@/components/molecules/drawer/RightDrawer', () => ({
  RightDrawer: ({
    children,
    onKeyDown,
    isOpen,
    ariaLabel,
  }: {
    readonly children: ReactNode;
    readonly isOpen: boolean;
    readonly ariaLabel?: string;
    readonly onKeyDown?: (event: KeyboardEvent) => void;
  }) =>
    isOpen ? (
      <div
        role='dialog'
        aria-label={ariaLabel ?? 'Details'}
        tabIndex={-1}
        data-testid='drawer'
        onKeyDown={onKeyDown}
      >
        {children}
      </div>
    ) : null,
}));

describe('AdminDetailRail certificate', () => {
  it('is axe-clean open, with a collapsed section, and closes on Escape', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const { container } = render(
      <AdminDetailRail
        isOpen
        ariaLabel='Customer details'
        onClose={onClose}
        entityHeader={<h2>Customer</h2>}
        footer={<button type='button'>Save</button>}
      >
        <DrawerSection title='Evidence'>
          <p>Observed evidence</p>
        </DrawerSection>
      </AdminDetailRail>
    );

    expect(screen.getByRole('heading', { name: 'Customer' })).toBeVisible();
    await expectNoA11yViolations(container);

    const toggle = screen.getByRole('button', { name: 'Evidence' });
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByText('Observed evidence')).not.toBeVisible();
    await expectNoA11yViolations(container);

    toggle.focus();
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('is axe-clean in the empty state', async () => {
    const { container } = render(
      <AdminDetailRail
        isOpen
        isEmpty
        ariaLabel='Customer details'
        emptyMessage='Select a customer to inspect it.'
        onClose={vi.fn()}
      >
        {null}
      </AdminDetailRail>
    );

    expect(
      screen.getByText('Select a customer to inspect it.')
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('renders nothing when closed', () => {
    render(
      <AdminDetailRail isOpen={false} ariaLabel='Customer details'>
        <p>Hidden</p>
      </AdminDetailRail>
    );

    expect(screen.queryByTestId('drawer')).toBeNull();
    expect(screen.queryByText('Hidden')).toBeNull();
  });
});
