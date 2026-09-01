import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ComboboxOptionItem } from './ComboboxOptionItem';

const optionState = vi.hoisted(() => ({
  current: {
    focus: false,
    selected: false,
  },
}));

vi.mock('@headlessui/react', () => ({
  ComboboxOption: ({
    children,
    className,
    ...props
  }: {
    children:
      | ReactNode
      | ((state: { focus: boolean; selected: boolean }) => ReactNode);
    className?:
      | string
      | ((state: { focus: boolean; selected: boolean }) => string);
  }) => (
    <div
      role='option'
      aria-selected={optionState.current.selected}
      className={
        typeof className === 'function'
          ? className(optionState.current)
          : className
      }
      {...props}
    >
      {typeof children === 'function'
        ? children(optionState.current)
        : children}
    </div>
  ),
}));

describe('ComboboxOptionItem', () => {
  it('uses shared option tokens for focus state without selected indicators', () => {
    optionState.current = { focus: true, selected: false };

    render(
      <ComboboxOptionItem
        option={{ id: 'one', name: 'First Artist' }}
        index={0}
      />
    );

    const option = screen.getByRole('option', { name: 'First Artist' });
    expect(option.className).toContain('bg-surface-1');
    expect(option.className).toContain('text-primary-token');
    expect(option.className).not.toContain('bg-accent');
    expect(option.className).not.toContain('text-accent-foreground');
    expect(
      screen.queryByTestId('combobox-option-selected-indicator')
    ).not.toBeInTheDocument();
  });

  it('shows the selected check only for selected options', () => {
    optionState.current = { focus: false, selected: true };

    render(
      <ComboboxOptionItem
        option={{ id: 'two', name: 'Second Artist' }}
        index={1}
      />
    );

    const option = screen.getByRole('option', { name: 'Second Artist' });
    expect(option.className).toContain('bg-surface-1');
    expect(option.className).not.toContain('text-indigo-600');
    expect(
      screen.getByTestId('combobox-option-selected-indicator')
    ).toBeInTheDocument();
  });
});
