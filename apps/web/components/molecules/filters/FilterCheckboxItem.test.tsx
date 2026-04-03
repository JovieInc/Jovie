import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FilterCheckboxItem } from './FilterCheckboxItem';

describe('FilterCheckboxItem', () => {
  it('renders both count and checkmark when a counted option is selected', () => {
    render(
      <FilterCheckboxItem
        label='Todo'
        count={2}
        checked
        onCheckedChange={vi.fn()}
      />
    );

    const row = screen.getByRole('button', { name: /Todo/ });

    expect(row).toHaveAttribute('data-selected', 'true');
    expect(row.querySelector('[data-menu-trailing]')).toHaveTextContent('2');
    expect(row.querySelector('svg')).toBeTruthy();
  });

  it('supports keyboard selection with Enter', () => {
    const onCheckedChange = vi.fn();

    render(
      <FilterCheckboxItem
        label='Todo'
        checked={false}
        onCheckedChange={onCheckedChange}
      />
    );

    fireEvent.keyDown(screen.getByRole('button', { name: 'Todo' }), {
      key: 'Enter',
    });

    expect(onCheckedChange).toHaveBeenCalledTimes(1);
  });
});
