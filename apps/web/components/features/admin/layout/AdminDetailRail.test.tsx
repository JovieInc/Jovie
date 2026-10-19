import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DrawerSection } from '@/components/molecules/drawer/DrawerSection';
import { SIDEBAR_WIDTH } from '@/lib/constants/layout';
import { AdminDetailRail } from './AdminDetailRail';

vi.mock('@/components/molecules/drawer/RightDrawer', () => ({
  RightDrawer: ({
    children,
    width,
    onKeyDown,
    isOpen,
  }: {
    readonly children: React.ReactNode;
    readonly width: number;
    readonly isOpen: boolean;
    readonly onKeyDown?: (event: React.KeyboardEvent) => void;
  }) =>
    isOpen ? (
      <div
        role='dialog'
        tabIndex={-1}
        data-testid='drawer'
        data-width={width}
        onKeyDown={onKeyDown}
      >
        {children}
      </div>
    ) : null,
}));

describe('AdminDetailRail', () => {
  it('shares geometry and flat hierarchy while retaining sections, footer actions, and Escape', () => {
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
    expect(screen.getByTestId('drawer')).toHaveAttribute(
      'data-width',
      String(SIDEBAR_WIDTH)
    );
    expect(container.querySelector('[data-surface-variant="card"]')).toBeNull();
    expect(screen.getByRole('heading', { name: 'Customer' })).toBeVisible();
    expect(screen.getByText('Observed evidence')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Evidence' }));
    expect(screen.getByText('Observed evidence')).not.toBeVisible();
    expect(screen.getByRole('button', { name: 'Save' })).toBeVisible();
    fireEvent.keyDown(screen.getByTestId('drawer'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });
});
