import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SidebarDock } from '@/components/shell/SidebarDock';

describe('SidebarDock', () => {
  it('keeps navigation row offsets stable when bottom-owned content enters', () => {
    const { getByTestId, rerender } = render(
      <div className='flex h-80 flex-col'>
        <nav className='min-h-0 flex-1 overflow-y-auto'>
          <button data-testid='nav-row' type='button'>
            One
          </button>
        </nav>
        <SidebarDock userId='one' />
      </div>
    );
    const row = getByTestId('nav-row');
    const rowOffsetBefore = row.offsetTop;

    rerender(
      <div className='flex h-80 flex-col'>
        <nav className='min-h-0 flex-1 overflow-y-auto'>
          <button data-testid='nav-row' type='button'>
            One
          </button>
        </nav>
        <SidebarDock userId='one' update={{ state: 'ready', version: '2' }} />
      </div>
    );

    expect(getByTestId('nav-row')).toBe(row);
    expect(row.offsetTop).toBe(rowOffsetBefore);
    expect(document.querySelector('[data-sidebar-dock]')).toHaveClass(
      'shrink-0'
    );
  });
});
