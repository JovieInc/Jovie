import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Combobox } from './Combobox';

vi.mock('@headlessui/react', () => ({
  Combobox: ({
    children,
  }: {
    children: ReactNode | ((state: { open: boolean }) => ReactNode);
  }) => (
    <div>
      {typeof children === 'function' ? children({ open: false }) : children}
    </div>
  ),
  ComboboxInput: ({
    displayValue: _displayValue,
    ...props
  }: Record<string, unknown>) => <input {...props} />,
  ComboboxButton: ({ children, ...props }: { children: ReactNode }) => (
    <button type='button' {...props}>
      {children}
    </button>
  ),
  ComboboxOptions: ({
    children,
    static: isOpen,
    ...props
  }: {
    children: ReactNode;
    static?: boolean;
  }) => (isOpen ? <div {...props}>{children}</div> : null),
}));

const options = [
  { id: 'one', name: 'First Artist' },
  { id: 'two', name: 'Second Artist' },
];

describe('Combobox', () => {
  it('uses the canonical spinner while results are loading', () => {
    render(
      <Combobox
        options={options}
        value={null}
        onChange={vi.fn()}
        onInputChange={vi.fn()}
        isLoading
      />
    );

    expect(screen.getByRole('status', { name: 'Loading' })).toHaveAttribute(
      'data-size',
      'sm'
    );
  });
});
