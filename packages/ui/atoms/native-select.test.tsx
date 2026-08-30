import { fireEvent, render, screen } from '@testing-library/react';
import * as React from 'react';
import { describe, expect, it, vi } from 'vitest';

import { NativeSelect } from './native-select';

const OPTIONS = [
  { value: 'draft', label: 'Draft' },
  { value: 'live', label: 'Live' },
  { value: 'archived', label: 'Archived', disabled: true },
] as const;

describe('NativeSelect', () => {
  it('preserves native refs, change events, and option state', () => {
    const ref = React.createRef<HTMLSelectElement>();
    const onChange = vi.fn();

    render(
      <NativeSelect
        ref={ref}
        aria-label='Status'
        options={OPTIONS}
        name='status'
        onChange={onChange}
      />
    );

    const select = screen.getByRole('combobox', { name: 'Status' });
    expect(ref.current).toBe(select);
    expect(select).toHaveAttribute('name', 'status');
    expect(screen.getByRole('option', { name: 'Archived' })).toBeDisabled();

    fireEvent.change(select, { target: { value: 'live' } });
    expect(select).toHaveValue('live');
    expect(onChange).toHaveBeenCalledOnce();
  });

  it('associates its label, required state, and error message', () => {
    render(
      <NativeSelect
        options={OPTIONS}
        label='Release status'
        error='Choose a status'
        required
      />
    );

    const select = screen.getByRole('combobox', { name: 'Release status' });
    const error = screen.getByRole('alert');

    expect(select).toBeRequired();
    expect(select).toHaveAttribute('aria-invalid', 'true');
    expect(select).toHaveAttribute('aria-describedby', error.id);
    expect(select).toHaveAttribute('data-state', 'invalid');
  });

  it('keeps native form submission semantics', () => {
    const { container } = render(
      <form>
        <NativeSelect
          options={OPTIONS}
          aria-label='Status'
          name='status'
          defaultValue='draft'
        />
      </form>
    );

    const form = container.querySelector('form');
    expect(form).not.toBeNull();
    expect(new FormData(form as HTMLFormElement).get('status')).toBe('draft');
  });

  it('merges custom classes with canonical focus and surface tokens', () => {
    render(
      <NativeSelect
        options={OPTIONS}
        aria-label='Status'
        className='custom-select'
      />
    );

    const select = screen.getByRole('combobox', { name: 'Status' });
    expect(select).toHaveClass('custom-select');
    expect(select.className).toContain('text-app');
    expect(select.className).toContain('border-(--linear-border-subtle)');
    expect(select.className).toContain(
      'focus-visible:border-(--linear-border-focus)'
    );
  });
});
