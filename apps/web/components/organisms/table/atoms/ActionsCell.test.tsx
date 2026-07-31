import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ActionsCell } from './ActionsCell';

describe('ActionsCell', () => {
  it('uses the shared contextual action slot rather than route-local hover classes', () => {
    render(
      <ActionsCell
        actions={<button type='button'>Quick Action</button>}
        menu={<button type='button'>More</button>}
      />
    );

    for (const button of [
      screen.getByRole('button', { name: 'Quick Action' }),
      screen.getByRole('button', { name: 'More' }),
    ]) {
      expect(button.parentElement).toHaveClass(
        'system-b-table-contextual-action'
      );
      expect(button.parentElement).not.toHaveAttribute('data-menu-open');
    }
  });

  it('keeps the slot visibly mounted while its menu is open', () => {
    render(
      <ActionsCell menu={<button type='button'>More</button>} isMenuOpen />
    );

    const slot = screen.getByRole('button', { name: 'More' }).parentElement;
    expect(slot).toHaveAttribute('data-menu-open', 'true');
    expect(slot).toHaveClass('opacity-100', 'pointer-events-auto');
  });
});
