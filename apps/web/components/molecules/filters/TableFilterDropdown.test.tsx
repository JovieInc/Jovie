'use client';

import { TooltipProvider } from '@jovie/ui';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@jovie/ui', async () => {
  const actual = await vi.importActual<typeof import('@jovie/ui')>('@jovie/ui');

  return {
    ...actual,
    DropdownMenu: ({ children }: { children: ReactNode }) => <>{children}</>,
    DropdownMenuTrigger: ({ children }: { children: ReactNode }) => (
      <>{children}</>
    ),
    DropdownMenuContent: ({
      children,
      className,
      onCloseAutoFocus: _onCloseAutoFocus,
      sideOffset: _sideOffset,
      ...props
    }: HTMLAttributes<HTMLDivElement> & {
      className?: string;
      onCloseAutoFocus?: unknown;
      sideOffset?: unknown;
    }) => (
      <div role='menu' className={className} {...props}>
        {children}
      </div>
    ),
    DropdownMenuSub: ({ children }: { children: ReactNode }) => <>{children}</>,
    DropdownMenuSubTrigger: ({
      children,
      className,
      inset: _inset,
      ...props
    }: ButtonHTMLAttributes<HTMLButtonElement> & {
      className?: string;
      inset?: unknown;
    }) => (
      <button type='button' className={className} {...props}>
        {children}
      </button>
    ),
    DropdownMenuSubContent: ({
      children,
      className,
      sideOffset: _sideOffset,
      ...props
    }: HTMLAttributes<HTMLDivElement> & {
      className?: string;
      sideOffset?: unknown;
    }) => (
      <div role='menu' className={className} {...props}>
        {children}
      </div>
    ),
    DropdownMenuItem: ({
      children,
      disabled,
    }: {
      children: ReactNode;
      disabled?: boolean;
    }) => (
      <div
        role='menuitem'
        tabIndex={-1}
        aria-disabled={disabled ? 'true' : undefined}
      >
        {children}
      </div>
    ),
    DropdownMenuSeparator: (props: HTMLAttributes<HTMLHRElement>) => (
      <hr {...props} />
    ),
    TooltipShortcut: ({ children }: { children: ReactNode }) => children,
    Button: ({
      children,
      ...props
    }: ButtonHTMLAttributes<HTMLButtonElement>) => (
      <button type='button' {...props}>
        {children}
      </button>
    ),
  };
});

import { TableFilterDropdown } from './TableFilterDropdown';

describe('TableFilterDropdown', () => {
  it('renders a labeled trigger without icon-only chrome', () => {
    render(
      <TooltipProvider>
        <TableFilterDropdown
          iconOnly={false}
          categories={[
            {
              id: 'status',
              label: 'Status',
              iconName: 'Hash',
              options: [{ id: 'todo', label: 'Todo' }],
              selectedIds: [],
              onToggle: vi.fn(),
            },
          ]}
        />
      </TooltipProvider>
    );

    expect(screen.getByRole('button', { name: 'Filter' })).toHaveTextContent(
      'Filter'
    );
  });

  it('renders the shared menu header contract inside submenu search panels', () => {
    render(
      <TooltipProvider>
        <TableFilterDropdown
          categories={[
            {
              id: 'status',
              label: 'Status',
              iconName: 'Hash',
              options: [{ id: 'todo', label: 'Todo', count: 2 }],
              selectedIds: ['todo'],
              onToggle: vi.fn(),
            },
          ]}
          headerLabel='Filter Tasks'
          shortcutHint='S'
        />
      </TooltipProvider>
    );

    const surfaces = document.querySelectorAll('[data-menu-surface="toolbar"]');
    const submenuSurface = surfaces.item(surfaces.length - 1);

    expect(submenuSurface).toBeTruthy();
    expect(
      within(submenuSurface as HTMLElement).getByText('Filter Tasks')
    ).toBeInTheDocument();
    expect(
      within(submenuSurface as HTMLElement).getByText('S')
    ).toBeInTheDocument();
    expect(
      (submenuSurface as HTMLElement).querySelector('[data-menu-header]')
    ).toBeTruthy();
  });

  it("shows 'No options found' when the search filters options down to zero", () => {
    render(
      <TooltipProvider>
        <TableFilterDropdown
          categories={[
            {
              id: 'status',
              label: 'Status',
              iconName: 'Hash',
              options: [{ id: 'todo', label: 'Todo' }],
              selectedIds: [],
              onToggle: vi.fn(),
            },
          ]}
        />
      </TooltipProvider>
    );

    fireEvent.change(screen.getByPlaceholderText('Search Status'), {
      target: { value: 'zzz-no-match' },
    });

    expect(screen.getByText('No options found')).toBeInTheDocument();
    expect(screen.queryByText('Todo')).not.toBeInTheDocument();
  });
});

describe('TableFilterDropdown a11y (JOV-8873)', () => {
  it('renders the empty state as a disabled menu item', () => {
    render(
      <TooltipProvider>
        <TableFilterDropdown categories={[]} emptyMessage='No filters yet' />
      </TooltipProvider>
    );
    const item = screen.getByRole('menuitem');
    expect(item).toHaveAttribute('aria-disabled', 'true');
    expect(item).toHaveTextContent('No filters yet');
  });

  it('keeps the trigger interactive while the menu is closed', () => {
    render(
      <TooltipProvider>
        <TableFilterDropdown categories={[]} />
      </TooltipProvider>
    );
    expect(screen.getByRole('button', { name: 'Filter' })).not.toHaveAttribute(
      'inert'
    );
  });
});
