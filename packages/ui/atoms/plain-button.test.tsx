import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '../test-utils/a11y';

import { PlainButton, plainButtonFocusClassName } from './plain-button';

describe('PlainButton', () => {
  it('renders a native button that defaults to type="button"', () => {
    render(<PlainButton>Open</PlainButton>);
    const button = screen.getByRole('button', { name: 'Open' });
    expect(button.tagName).toBe('BUTTON');
    expect(button).toHaveAttribute('type', 'button');
    expect(button).toHaveAttribute('data-slot', 'plain-button');
  });

  it('does not submit a surrounding form unless asked to', () => {
    const onSubmit = vi.fn((event: React.FormEvent) => event.preventDefault());
    render(
      <form onSubmit={onSubmit}>
        <PlainButton>Toggle</PlainButton>
        <PlainButton type='submit'>Save</PlainButton>
      </form>
    );
    fireEvent.click(screen.getByRole('button', { name: 'Toggle' }));
    expect(onSubmit).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('adds the shared focus ring when the caller brings no focus styling', () => {
    render(<PlainButton className='rounded-md px-2'>Row</PlainButton>);
    const button = screen.getByRole('button', { name: 'Row' });
    for (const token of plainButtonFocusClassName.split(' ')) {
      expect(button).toHaveClass(token);
    }
    expect(button).toHaveClass('rounded-md', 'px-2');
  });

  it.each([
    'focus-visible:ring-1 focus-visible:ring-accent',
    'focus-ring-themed',
    'focus:outline-none',
    'focus-within:bg-surface-1',
  ])('keeps only the caller focus treatment for %s', focusClasses => {
    render(<PlainButton className={`px-2 ${focusClasses}`}>Row</PlainButton>);
    const button = screen.getByRole('button', { name: 'Row' });
    expect(button).not.toHaveClass('focus-visible:ring-focus');
    expect(button.className).toBe(`px-2 ${focusClasses}`);
  });

  it('marks and blocks a disabled button', async () => {
    const onClick = vi.fn();
    render(
      <PlainButton disabled onClick={onClick}>
        Send
      </PlainButton>
    );
    const button = screen.getByRole('button', { name: 'Send' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('data-disabled', '');
    await userEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('is reachable and pressable from the keyboard', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<PlainButton onClick={onClick}>Next</PlainButton>);
    await user.tab();
    const button = screen.getByRole('button', { name: 'Next' });
    expect(button).toHaveFocus();
    await user.keyboard('{Enter}');
    await user.keyboard(' ');
    expect(onClick).toHaveBeenCalledTimes(2);
  });

  it('forwards refs and native props', () => {
    const ref = React.createRef<HTMLButtonElement>();
    render(
      <PlainButton ref={ref} aria-pressed='true' title='Pinned'>
        Pin
      </PlainButton>
    );
    expect(ref.current).toBeInstanceOf(HTMLButtonElement);
    expect(ref.current).toHaveAttribute('aria-pressed', 'true');
    expect(ref.current).toHaveAttribute('title', 'Pinned');
  });

  it('has no accessibility violations', async () => {
    const { container } = render(
      <div>
        <PlainButton>Open</PlainButton>
        <PlainButton disabled>Closed</PlainButton>
        <PlainButton aria-label='Pin row'>
          <svg aria-hidden='true' />
        </PlainButton>
      </div>
    );
    await expectNoA11yViolations(container);
  });
});
