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
const legacyTextWhiteClass = ['text', 'white'].join('-');

describe('Combobox', () => {
  it('uses tokenized combobox input surface states', () => {
    render(
      <Combobox
        options={options}
        value={null}
        onChange={vi.fn()}
        onInputChange={vi.fn()}
      />
    );

    const input = screen.getByLabelText('Search for an artist');
    const surface = input.closest('[data-combobox-surface]');
    expect(surface?.className).toContain('bg-surface-0');
    expect(surface?.className).toContain('border-subtle');
    expect(surface?.className).toContain('focus-within:ring-focus/25');
    expect(input.className).toContain('text-primary-token');
    expect(input.className).toContain('placeholder:text-tertiary-token');
    expect(input.className).not.toContain(legacyTextWhiteClass);
    expect(
      screen.getByRole('button', { name: 'Open dropdown' }).className
    ).toContain('text-tertiary-token');
  });

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
