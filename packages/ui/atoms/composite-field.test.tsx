import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { CompositeField } from './composite-field';

describe('CompositeField', () => {
  it('carries the composite-field class that owns the ring and reset', () => {
    const ref = createRef<HTMLDivElement>();
    render(
      <CompositeField ref={ref} data-testid='field'>
        <span>jov.ie/</span>
        <input aria-label='Handle' />
      </CompositeField>
    );
    const field = screen.getByTestId('field');
    expect(field.tagName).toBe('DIV');
    expect(ref.current).toBe(field);
    expect(field).toHaveAttribute('data-component', 'composite-field');
    expect(field).toHaveClass('composite-field', 'rounded-full');
  });

  it('uses the supplied native label as the only owner, including its ref and events', async () => {
    const user = userEvent.setup();
    const ref = createRef<HTMLLabelElement>();
    const onFocus = vi.fn();
    const { container } = render(
      <CompositeField asChild ref={ref} shape='md' data-testid='field'>
        <label htmlFor='account-handle' onFocus={onFocus}>
          <span>Account handle</span>
          <input id='account-handle' />
        </label>
      </CompositeField>
    );
    const input = screen.getByRole('textbox', { name: 'Account handle' });
    const owner = screen.getByTestId('field');

    expect(container.firstElementChild).toBe(owner);
    expect(owner.tagName).toBe('LABEL');
    expect(input.parentElement).toBe(owner);
    expect(ref.current).toBe(owner);
    expect(owner).toHaveAttribute('for', 'account-handle');
    expect(owner).toHaveClass('composite-field', 'rounded-lg');
    await user.click(screen.getByText('Account handle'));
    expect(input).toHaveFocus();
    expect(onFocus).toHaveBeenCalled();
    await user.keyboard('artist');
    expect(input).toHaveValue('artist');
  });

  it('keeps native text controls and the adjacent button in the tab order', async () => {
    const user = userEvent.setup();
    render(
      <>
        <CompositeField>
          <input type='search' aria-label='Search artists' />
          <textarea aria-label='Message' />
          <select aria-label='Platform'>
            <option>Spotify</option>
          </select>
          <button type='button'>Clear search</button>
        </CompositeField>
        <input aria-label='Standalone handle' />
      </>
    );
    for (const name of [
      'Search artists',
      'Message',
      'Platform',
      'Clear search',
      'Standalone handle',
    ]) {
      await user.tab();
      expect(
        name === 'Clear search'
          ? screen.getByRole('button', { name })
          : screen.getByLabelText(name)
      ).toHaveFocus();
    }
  });

  it('supports a rounded-rect shape', () => {
    render(<CompositeField data-testid='field' shape='md' />);
    expect(screen.getByTestId('field').className).toContain('rounded-lg');
  });

  it('exposes the field surface as a data attribute for CSS', () => {
    render(<CompositeField data-testid='field' surface='field' />);
    expect(screen.getByTestId('field')).toHaveAttribute(
      'data-surface',
      'field'
    );
  });
});
