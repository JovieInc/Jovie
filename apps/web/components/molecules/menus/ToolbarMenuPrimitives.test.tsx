import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DropdownMenu, DropdownMenuContent } from '@jovie/ui';
import { render, screen } from '@testing-library/react';
import { Circle } from 'lucide-react';
import { describe, expect, it, vi } from 'vitest';
import { ToolbarMenuChoiceItem, ToolbarMenuRow } from './ToolbarMenuPrimitives';

const toolbarMenuPrimitivesPath = resolve(
  __dirname,
  './ToolbarMenuPrimitives.tsx'
);
const designSystemPath = resolve(
  __dirname,
  '../../../styles/design-system.css'
);

const toolbarMenuSystemBClasses = [
  'system-b-toolbar-menu-content',
  'system-b-toolbar-menu-separator',
  'system-b-toolbar-menu-header',
  'system-b-toolbar-menu-header-badge',
  'system-b-toolbar-menu-row-selected',
  'system-b-toolbar-menu-item',
  'system-b-toolbar-menu-sub-trigger',
  'system-b-toolbar-menu-leading-visual',
  'system-b-toolbar-menu-trailing-visual',
  'system-b-toolbar-menu-check-icon',
] as const;

const rawVisualRecipes = [
  /color-mix\(/,
  /shadow-\[/,
  /backdrop-blur/,
  /rounded-\[[^\]]+\]/,
  /border-\[[^\]]+\]/,
  /bg-\[[^\]]+\]/,
  /text-\[[^\]]+\]/,
  /font-\[[^\]]+\]/,
  /duration-\d+/,
  /leading-\d+/,
  /\b(?:min-h|min-w|h|w|px|py|p)-\[[^\]]+\]/,
] as const;

describe('ToolbarMenuPrimitives', () => {
  it('keeps toolbar menu chrome on named System B classes', () => {
    const source = readFileSync(toolbarMenuPrimitivesPath, 'utf8');
    const designSystem = readFileSync(designSystemPath, 'utf8');
    const offenders = rawVisualRecipes
      .filter(pattern => pattern.test(source))
      .map(pattern => pattern.toString());

    expect(
      offenders,
      `ToolbarMenuPrimitives leaked raw visual recipes: ${offenders.join(', ')}`
    ).toEqual([]);

    for (const className of toolbarMenuSystemBClasses) {
      expect(source).toContain(className);
      expect(designSystem).toContain(className);
    }
  });

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
            trailingVisual={<span>3</span>}
            onSelect={vi.fn()}
          />
        </DropdownMenuContent>
      </DropdownMenu>
    );

    const row = screen.getByText('Done').closest('[data-menu-row]');

    expect(row).toHaveAttribute('data-selected', 'true');
    expect(row?.querySelector('[data-menu-trailing]')).toHaveTextContent('3');
    expect(row?.querySelector('[data-menu-trailing] svg')).toBeTruthy();
  });

  it('keeps disabled long-label rows on the same stable row contract', () => {
    render(
      <DropdownMenu open>
        <DropdownMenuContent>
          <ToolbarMenuChoiceItem
            active={false}
            disabled
            label='A very long toolbar menu label that should truncate without changing row geometry'
            onSelect={vi.fn()}
          />
        </DropdownMenuContent>
      </DropdownMenu>
    );

    const row = screen
      .getByText(/A very long toolbar menu label/)
      .closest('[data-menu-row]');

    expect(row).toHaveAttribute('data-disabled');
    expect(row).toHaveClass('system-b-toolbar-menu-item');
    expect(row?.querySelector('.truncate')).toHaveTextContent(
      /A very long toolbar menu label/
    );
  });
});
