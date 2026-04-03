'use client';

import { DropdownMenu, DropdownMenuContent } from '@jovie/ui';
import { render, screen } from '@testing-library/react';
import { Circle } from 'lucide-react';
import { describe, expect, it, vi } from 'vitest';
import { ToolbarMenuChoiceItem, ToolbarMenuRow } from './ToolbarMenuPrimitives';

describe('ToolbarMenuPrimitives', () => {
  it('renders leading, label, and trailing slots with stable data hooks', () => {
    render(
      <div data-testid='row'>
        <ToolbarMenuRow
          leadingVisual={<Circle aria-hidden='true' className='h-3 w-3' />}
          label='Status'
          trailingVisual={<span>2</span>}
        />
      </div>
    );

    const row = screen.getByTestId('row');

    expect(row.querySelector('[data-menu-leading]')).toBeTruthy();
    expect(row).toHaveTextContent('Status');
    expect(row.querySelector('[data-menu-trailing]')).toHaveTextContent('2');
  });

  it('marks selected menu items with a stable selected contract', () => {
    render(
      <DropdownMenu open>
        <DropdownMenuContent>
          <ToolbarMenuChoiceItem
            active
            label='Done'
            leadingVisual={<Circle aria-hidden='true' className='h-3 w-3' />}
            onSelect={vi.fn()}
          />
        </DropdownMenuContent>
      </DropdownMenu>
    );

    expect(screen.getByText('Done').closest('[data-menu-row]')).toHaveAttribute(
      'data-selected',
      'true'
    );
  });
});
