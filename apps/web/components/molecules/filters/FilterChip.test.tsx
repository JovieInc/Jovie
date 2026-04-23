import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FilterChip } from './FilterChip';

describe('FilterChip', () => {
  it('renders children inside a button', () => {
    render(
      <FilterChip pressed={false} onClick={vi.fn()}>
        Overdue
      </FilterChip>
    );
    expect(screen.getByRole('button', { name: 'Overdue' })).toBeInTheDocument();
  });

  it('reflects pressed state via aria-pressed', () => {
    const { rerender } = render(
      <FilterChip pressed={false} onClick={vi.fn()}>
        Label
      </FilterChip>
    );
    expect(screen.getByRole('button')).toHaveAttribute('aria-pressed', 'false');

    rerender(
      <FilterChip pressed={true} onClick={vi.fn()}>
        Label
      </FilterChip>
    );
    expect(screen.getByRole('button')).toHaveAttribute('aria-pressed', 'true');
  });

  it('fires onClick when clicked', () => {
    const onClick = vi.fn();
    render(
      <FilterChip pressed={false} onClick={onClick}>
        Label
      </FilterChip>
    );
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('forwards data-testid and aria-label', () => {
    render(
      <FilterChip
        pressed={false}
        onClick={vi.fn()}
        data-testid='chip-foo'
        aria-label='Toggle foo filter'
      >
        Foo
      </FilterChip>
    );
    const btn = screen.getByTestId('chip-foo');
    expect(btn).toHaveAttribute('aria-label', 'Toggle foo filter');
  });

  it('is focusable (native button, keyboard-reachable)', () => {
    render(
      <FilterChip pressed={false} onClick={vi.fn()}>
        Label
      </FilterChip>
    );
    const btn = screen.getByRole('button');
    btn.focus();
    expect(document.activeElement).toBe(btn);
  });

  it('has type=button to prevent form submission', () => {
    render(
      <FilterChip pressed={false} onClick={vi.fn()}>
        Label
      </FilterChip>
    );
    expect(screen.getByRole('button')).toHaveAttribute('type', 'button');
  });
});
