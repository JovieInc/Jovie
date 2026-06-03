import { render, screen } from '@testing-library/react';
import type { ComponentProps, ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { TableBulkActionsToolbar } from '@/components/organisms/table/molecules/TableBulkActionsToolbar';

vi.mock('@jovie/ui', () => ({
  Button: ({ children, ...props }: ComponentProps<'button'>) => (
    <button type='button' {...props}>
      {children}
    </button>
  ),
  DropdownMenu: ({ children }: { readonly children: ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuContent: ({ children }: { readonly children: ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuItem: ({
    children,
    variant: _variant,
    ...props
  }: ComponentProps<'button'> & { readonly variant?: string }) => (
    <button type='button' {...props}>
      {children}
    </button>
  ),
  DropdownMenuTrigger: ({ children }: { readonly children: ReactNode }) => (
    <>{children}</>
  ),
  TooltipShortcut: ({ children }: { readonly children: ReactNode }) => (
    <>{children}</>
  ),
}));

describe('TableBulkActionsToolbar', () => {
  it('keeps a hidden mounted overlay when no rows are selected', () => {
    const { container } = render(
      <TableBulkActionsToolbar
        selectedCount={0}
        onClearSelection={vi.fn()}
        actions={[]}
      />
    );

    const toolbar = container.firstElementChild;
    expect(toolbar).toBeInTheDocument();
    expect(toolbar).toHaveAttribute('aria-hidden', 'true');
    expect(toolbar).toHaveAttribute('data-state', 'hidden');
    expect(toolbar).toHaveClass('absolute', 'min-h-[44px]', 'opacity-0');
    expect(screen.queryByRole('button', { name: 'Clear' })).toBeNull();
  });

  it('renders selected count and actions in the visible state', () => {
    render(
      <TableBulkActionsToolbar
        selectedCount={2}
        onClearSelection={vi.fn()}
        actions={[
          {
            label: 'Delete',
            onClick: vi.fn(),
            variant: 'destructive',
          },
        ]}
      />
    );

    expect(screen.getByText('2 selected')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Actions' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Clear' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Delete' })).toBeEnabled();
  });
});
