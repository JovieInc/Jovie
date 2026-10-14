import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen } from '@testing-library/react';
import { Copy } from 'lucide-react';
import type { ComponentProps, ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DrawerHeaderActions } from '@/components/molecules/drawer-header/DrawerHeaderActions';

const tableActionMenuSpy = vi.fn();
const tableActionMenuPropsSpy = vi.fn();

vi.mock('@jovie/ui', () => ({
  Button: ({ children, ...props }: ComponentProps<'button'>) => (
    <button type='button' {...props}>
      {children}
    </button>
  ),
  IconButton: ({
    children,
    asChild: _,
    ariaLabel,
    variant,
    size,
    ...props
  }: ComponentProps<'button'> & {
    asChild?: boolean;
    ariaLabel?: string;
    variant?: string;
    size?: string;
  }) => (
    <button
      type='button'
      aria-label={ariaLabel ?? props['aria-label']}
      data-variant={variant}
      data-size={size}
      {...props}
    >
      {children}
    </button>
  ),
}));

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock('@/components/atoms/table-action-menu', () => ({
  TableActionMenu: (props: {
    items: unknown;
    children: ReactNode;
    searchable?: boolean;
    searchPlaceholder?: string;
    searchMode?: 'root' | 'recursive';
  }) => {
    const { items, children } = props;
    tableActionMenuSpy(items);
    tableActionMenuPropsSpy(props);
    return <div data-testid='table-action-menu'>{children}</div>;
  },
}));

describe('DrawerHeaderActions', () => {
  beforeEach(() => {
    tableActionMenuSpy.mockClear();
    tableActionMenuPropsSpy.mockClear();
  });

  it('appends separator and close action to overflow menu when onClose is provided', () => {
    const onClose = vi.fn();

    render(
      <DrawerHeaderActions
        primaryActions={[]}
        overflowActions={[
          {
            id: 'copy',
            label: 'Copy profile link',
            icon: Copy,
            onClick: vi.fn(),
          },
        ]}
        onClose={onClose}
      />
    );

    expect(screen.getByTestId('table-action-menu')).toBeInTheDocument();
    expect(tableActionMenuSpy).toHaveBeenCalledTimes(1);
    expect(tableActionMenuSpy).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'copy', label: 'Copy profile link' }),
      expect.objectContaining({ id: 'separator-close' }),
      expect.objectContaining({ id: 'close-drawer', label: 'Close' }),
    ]);
  });

  it('renders a close-only overflow menu for minimal chrome drawers', () => {
    const onClose = vi.fn();

    render(
      <DrawerHeaderActions
        primaryActions={[]}
        overflowActions={[]}
        onClose={onClose}
      />
    );

    expect(screen.getByTestId('table-action-menu')).toBeInTheDocument();
    expect(tableActionMenuSpy).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'close-drawer', label: 'Close' }),
    ]);
  });

  it('shows a visible close control below lg, where every drawer is a full-screen sheet', () => {
    const onClose = vi.fn();
    render(<DrawerHeaderActions primaryActions={[]} onClose={onClose} />);

    const close = screen.getByTestId('drawer-header-close');
    expect(close).toHaveAttribute('aria-label', 'Close');
    expect(close).toHaveAttribute('data-variant', 'ghost');
    expect(close.className).toBe('lg:hidden');
    close.click();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('omits the visible close control when the drawer cannot close', () => {
    render(<DrawerHeaderActions primaryActions={[]} />);
    expect(screen.queryByTestId('drawer-header-close')).toBeNull();
  });

  it('keeps the overflow trigger borderless', () => {
    render(
      <DrawerHeaderActions
        primaryActions={[]}
        overflowActions={[
          {
            id: 'copy',
            label: 'Copy profile link',
            icon: Copy,
            onClick: vi.fn(),
          },
        ]}
      />
    );

    const trigger = screen.getByLabelText('More actions');
    // Canonical ghost/sm IconButton: borderless by contract, no restyle.
    expect(trigger).toHaveAttribute('data-variant', 'ghost');
    expect(trigger).toHaveAttribute('data-size', 'sm');
    expect(trigger.getAttribute('class') ?? '').toBe('');
  });

  it('keeps copy-state icon swaps free of scale motion', () => {
    const source = readFileSync(
      resolve(
        process.cwd(),
        'components/molecules/drawer-header/DrawerHeaderActions.tsx'
      ),
      'utf8'
    );

    expect(source).not.toMatch(/\b(?:transition-all|scale-50|scale-100)\b/);
    expect(source).toContain('transition-opacity');
  });

  it('reuses shared dropdown menu items when menuItems is provided', () => {
    render(
      <DrawerHeaderActions
        primaryActions={[]}
        menuItems={[
          {
            type: 'submenu',
            id: 'share',
            label: 'Share',
            items: [
              {
                type: 'action',
                id: 'copy-link',
                label: 'Copy link',
                onClick: vi.fn(),
              },
            ],
          },
        ]}
      />
    );

    expect(tableActionMenuSpy).toHaveBeenCalledWith([
      expect.objectContaining({
        id: 'share',
        label: 'Share',
        children: [
          expect.objectContaining({
            id: 'copy-link',
            label: 'Copy link',
          }),
        ],
      }),
    ]);
  });

  it('forwards keyboard-first search configuration to the shared menu', () => {
    render(
      <DrawerHeaderActions
        primaryActions={[]}
        overflowActions={[
          {
            id: 'copy',
            label: 'Copy profile link',
            icon: Copy,
            onClick: vi.fn(),
          },
        ]}
        searchable
        searchPlaceholder='Search actions'
        searchMode='recursive'
      />
    );

    expect(tableActionMenuPropsSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        searchable: true,
        searchPlaceholder: 'Search actions',
        searchMode: 'recursive',
      })
    );
  });
});
