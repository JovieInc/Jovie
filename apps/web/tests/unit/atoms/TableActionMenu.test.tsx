import { render, screen } from '@testing-library/react';
import { Pencil, Trash2 } from 'lucide-react';
import { describe, expect, it, vi } from 'vitest';

import { TableActionMenu } from '@/components/atoms/table-action-menu/TableActionMenu';
import { expectNoA11yViolations } from '../../utils/a11y';

// Mock CommonDropdown to inspect the props it receives
vi.mock('@jovie/ui', async () => {
  const actual = await vi.importActual<typeof import('@jovie/ui')>('@jovie/ui');
  return {
    ...actual,
    CommonDropdown: ({
      items,
      triggerIcon: TriggerIcon,
      trigger,
      children,
    }: {
      items: Array<{
        type: string;
        id: string;
        label?: string;
        onClick?: () => void;
      }>;
      triggerIcon?: React.ComponentType<{ className?: string }>;
      trigger?: React.ReactNode;
      children?: React.ReactNode;
    }) => (
      <div data-testid='common-dropdown'>
        {TriggerIcon && (
          <button type='button' aria-label='Open menu'>
            <TriggerIcon className='h-4 w-4' />
          </button>
        )}
        {trigger && <div data-testid='custom-trigger'>{trigger}</div>}
        {children && <div data-testid='context-children'>{children}</div>}
        <ul data-testid='dropdown-items'>
          {items.map(item => (
            <li key={item.id} data-testid={`item-${item.id}`}>
              {item.type === 'separator' ? (
                <hr />
              ) : (
                <button type='button' onClick={item.onClick}>
                  {item.label}
                </button>
              )}
            </li>
          ))}
        </ul>
      </div>
    ),
  };
});

const sampleItems = [
  { id: 'edit', label: 'Edit', icon: Pencil, onClick: vi.fn() },
  { id: 'separator', label: '' },
  {
    id: 'delete',
    label: 'Delete',
    icon: Trash2,
    onClick: vi.fn(),
    variant: 'destructive' as const,
  },
];

describe('TableActionMenu', () => {
  it('renders the dropdown with trigger button', () => {
    render(<TableActionMenu items={sampleItems} />);
    expect(screen.getByTestId('common-dropdown')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Open menu' })
    ).toBeInTheDocument();
  });

  it('converts action items to dropdown items', () => {
    render(<TableActionMenu items={sampleItems} />);
    expect(screen.getByTestId('item-edit')).toBeInTheDocument();
    expect(screen.getByText('Edit')).toBeInTheDocument();
  });

  it('converts separator items to dropdown separators', () => {
    render(<TableActionMenu items={sampleItems} />);
    // Separator gets an auto-generated id prefixed with "separator-"
    expect(screen.getByTestId('item-separator-1')).toBeInTheDocument();
  });

  it('renders destructive items', () => {
    render(<TableActionMenu items={sampleItems} />);
    expect(screen.getByTestId('item-delete')).toBeInTheDocument();
    expect(screen.getByText('Delete')).toBeInTheDocument();
  });

  it('renders with custom trigger', () => {
    render(
      <TableActionMenu items={sampleItems} trigger='custom'>
        <button type='button'>Custom Trigger</button>
      </TableActionMenu>
    );
    expect(screen.getByTestId('custom-trigger')).toBeInTheDocument();
    expect(screen.getByText('Custom Trigger')).toBeInTheDocument();
  });

  it('renders with context trigger', () => {
    render(
      <TableActionMenu items={sampleItems} trigger='context'>
        <div>Right-click area</div>
      </TableActionMenu>
    );
    expect(screen.getByTestId('context-children')).toBeInTheDocument();
    expect(screen.getByText('Right-click area')).toBeInTheDocument();
  });

  it('handles items with children as submenus', () => {
    const itemsWithSubmenu = [
      {
        id: 'actions',
        label: 'Actions',
        children: [
          { id: 'copy', label: 'Copy', onClick: vi.fn() },
          { id: 'move', label: 'Move', onClick: vi.fn() },
        ],
      },
    ];
    render(<TableActionMenu items={itemsWithSubmenu} />);
    expect(screen.getByTestId('item-actions')).toBeInTheDocument();
  });

  it('has no accessibility violations', async () => {
    const { container } = render(<TableActionMenu items={sampleItems} />);
    await expectNoA11yViolations(container);
  });
});
