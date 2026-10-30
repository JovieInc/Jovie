import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CompositeField } from './composite-field';

describe('CompositeField', () => {
  it('carries the composite-field class that owns the ring and reset', () => {
    render(
      <CompositeField data-testid='field'>
        <span>jov.ie/</span>
        <input aria-label='Handle' />
      </CompositeField>
    );
    const field = screen.getByTestId('field');
    expect(field).toHaveAttribute('data-component', 'composite-field');
    expect(field).toHaveClass('composite-field', 'rounded-full');
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
