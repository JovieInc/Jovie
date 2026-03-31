import { render, screen } from '@testing-library/react';
import { Copy } from 'lucide-react';
import type { ComponentProps, ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DrawerHeaderActions } from '@/components/molecules/drawer-header/DrawerHeaderActions';

const tableActionMenuSpy = vi.fn();

vi.mock('@jovie/ui', () => ({
  Button: ({ children, ...props }: ComponentProps<'button'>) => (
    <button type='button' {...props}>
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
  TableActionMenu: ({
    items,
    children,
  }: {
    items: unknown;
    children: ReactNode;
  }) => {
    tableActionMenuSpy(items);
    return <div data-testid='table-action-menu'>{children}</div>;
  },
}));

describe('DrawerHeaderActions', () => {
  beforeEach(() => {
    tableActionMenuSpy.mockClear();
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
});
