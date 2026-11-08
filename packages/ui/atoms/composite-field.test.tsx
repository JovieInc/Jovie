import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '../test-utils/a11y';
import { Button } from './button';
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

function ClaimHandleHarness({
  note,
  onClaim,
}: {
  readonly note: string;
  readonly onClaim: (handle: string) => void;
}) {
  const [handle, setHandle] = React.useState('');
  return (
    <div>
      <p>{note}</p>
      <CompositeField data-testid='field' surface='field'>
        <span>jov.ie/</span>
        <input
          aria-label='Choose your handle'
          value={handle}
          onChange={event => setHandle(event.target.value)}
        />
        <Button type='button' onClick={() => onClaim(handle)}>
          Claim
        </Button>
      </CompositeField>
    </div>
  );
}

describe('CompositeField certificate evidence', () => {
  it('keeps typed input and focus across a parent rerender, Escape, and blur', async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <CompositeField shape='pill' surface='page'>
        <span>jov.ie/</span>
        <input aria-label='Handle' />
      </CompositeField>
    );
    const input = screen.getByRole('textbox', { name: 'Handle' });

    await user.click(input);
    await user.type(input, 'hello');
    expect(input).toHaveValue('hello');

    // The parent changes surface: the container restyles without remounting.
    rerender(
      <CompositeField shape='pill' surface='field'>
        <span>jov.ie/</span>
        <input aria-label='Handle' />
      </CompositeField>
    );
    expect(screen.getByRole('textbox', { name: 'Handle' })).toBe(input);
    expect(input).toHaveFocus();
    expect(input).toHaveValue('hello');

    await user.keyboard('{Escape}');
    expect(input).toHaveValue('hello');
    expect(input).toHaveFocus();

    await user.tab();
    expect(input).not.toHaveFocus();
    expect(input).toHaveValue('hello');
  });

  it('keeps a controlled value through unrelated parent state and an inner button press', async () => {
    const user = userEvent.setup();
    const onClaim = vi.fn();
    const { rerender } = render(
      <ClaimHandleHarness note='first' onClaim={onClaim} />
    );
    const input = screen.getByRole('textbox', { name: 'Choose your handle' });

    await user.type(input, 'hello');
    rerender(<ClaimHandleHarness note='second' onClaim={onClaim} />);
    expect(screen.getByText('second')).toBeInTheDocument();
    expect(input).toHaveValue('hello');
    expect(input).toHaveFocus();

    await user.click(screen.getByRole('button', { name: 'Claim' }));
    expect(onClaim).toHaveBeenCalledWith('hello');
    expect(input).toHaveValue('hello');
  });

  it('has no axe violations for the default and invalid claim fields', async () => {
    const { container } = render(
      <div>
        <CompositeField surface='page'>
          <label htmlFor='cf-a11y-handle' className='sr-only'>
            Choose your handle
          </label>
          <span>jov.ie/</span>
          <input id='cf-a11y-handle' placeholder='you' />
          <Button type='button'>Claim</Button>
        </CompositeField>
        <CompositeField surface='field'>
          <span>jov.ie/</span>
          <input
            aria-label='Taken handle'
            aria-invalid='true'
            aria-describedby='cf-a11y-error'
            defaultValue='taken'
          />
        </CompositeField>
        <p id='cf-a11y-error' role='alert'>
          That handle is already taken.
        </p>
      </div>
    );
    await expectNoA11yViolations(container);
  });
});
