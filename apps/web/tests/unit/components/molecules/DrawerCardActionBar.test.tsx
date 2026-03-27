import { render, screen } from '@testing-library/react';
import { Copy, ExternalLink } from 'lucide-react';
import type { ComponentProps, ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@jovie/ui', () => ({
  Button: ({
    children,
    ...props
  }: ComponentProps<'button'> & { asChild?: boolean }) => (
    <button type='button' {...props}>
      {children}
    </button>
  ),
}));

vi.mock('@/components/atoms/table-action-menu', () => ({
  TableActionMenu: ({
    children,
    items,
  }: {
    children: ReactNode;
    items: Array<{ id: string; label: string }>;
  }) => (
    <div data-testid='table-action-menu'>
      {children}
      <div data-testid='table-action-menu-items'>
        {items.map(item => (
          <span key={item.id}>{item.label || 'separator'}</span>
        ))}
      </div>
    </div>
  ),
}));

const { DrawerCardActionBar } = await import(
  '@/components/molecules/drawer/DrawerCardActionBar'
);

describe('DrawerCardActionBar', () => {
  it('renders a floating top-right overflow trigger and merges close into the menu', () => {
    render(
      <div className='relative'>
        <DrawerCardActionBar
          primaryActions={[
            {
              id: 'copy',
              label: 'Copy profile link',
              icon: Copy,
              onClick: vi.fn(),
            },
          ]}
          overflowActions={[
            {
              id: 'open',
              label: 'Open profile',
              icon: ExternalLink,
              onClick: vi.fn(),
            },
          ]}
          onClose={vi.fn()}
          overflowTriggerPlacement='card-top-right'
        />
      </div>
    );

    expect(
      screen.getByRole('button', { name: 'Copy profile link' })
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('drawer-card-overflow-trigger')
    ).toBeInTheDocument();
    expect(screen.getByTestId('drawer-card-action-bar')).toHaveAttribute(
      'data-overflow-placement',
      'card-top-right'
    );
    expect(screen.getByTestId('table-action-menu-items')).toHaveTextContent(
      'Open profile'
    );
    expect(screen.getByTestId('table-action-menu-items')).toHaveTextContent(
      'Close'
    );
  });
});
