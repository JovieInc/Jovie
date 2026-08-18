import { fireEvent, render, screen } from '@testing-library/react';
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Select } from './Select';

const options = [
  { value: 'draft', label: 'Draft' },
  { value: 'live', label: 'Live' },
];

describe('app Select compatibility wrapper', () => {
  it('retains the native ref and change-event contract', () => {
    const ref = createRef<HTMLSelectElement>();
    const onChange = vi.fn();

    render(
      <Select
        ref={ref}
        options={options}
        aria-label='Status'
        onChange={onChange}
      />
    );

    const select = screen.getByRole('combobox', { name: 'Status' });
    expect(ref.current).toBe(select);
    expect(select).toHaveAttribute('data-slot', 'native-select');

    fireEvent.change(select, { target: { value: 'live' } });
    expect(select).toHaveValue('live');
    expect(onChange).toHaveBeenCalledOnce();
  });

  it('delegates label, required, and error anatomy to NativeSelect', () => {
    render(
      <Select
        options={options}
        label='Release status'
        error='Choose a status'
        required
      />
    );

    const select = screen.getByRole('combobox', { name: 'Release status' });
    expect(select).toBeRequired();
    expect(select).toHaveAttribute('data-state', 'invalid');
    expect(screen.getByRole('alert')).toHaveTextContent('Choose a status');
  });
});
