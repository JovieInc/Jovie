import { fireEvent, render, screen } from '@testing-library/react';
import type * as React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Button } from './button';

// Pending (loading) keeps the button in the tab order: aria-disabled and
// aria-busy announce the state while activation is cancelled, so a focused
// submit button does not drop focus to <body> mid-action.
describe('Button pending focus', () => {
  it('keeps focus on the button when it enters loading', () => {
    const { rerender } = render(<Button>Join</Button>);
    const button = screen.getByRole('button');
    button.focus();
    expect(button).toHaveFocus();

    rerender(<Button loading>Join</Button>);
    expect(button).not.toBeDisabled();
    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(button).toHaveFocus();
  });

  it('cancels clicks and keyboard activation while loading', () => {
    const onClick = vi.fn();
    const onClickCapture = vi.fn();
    render(
      <Button loading onClick={onClick} onClickCapture={onClickCapture}>
        Save
      </Button>
    );
    const button = screen.getByRole('button');
    // Enter/Space and assistive technologies synthesize a detail=0 click.
    expect(fireEvent.click(button, { detail: 0 })).toBe(false);
    expect(fireEvent.click(button)).toBe(false);
    expect(onClick).not.toHaveBeenCalled();
    expect(onClickCapture).not.toHaveBeenCalled();
  });

  it('does not submit its form again while loading', () => {
    const onSubmit = vi.fn((event: React.FormEvent) => event.preventDefault());
    render(
      <form onSubmit={onSubmit}>
        <Button type='submit' loading>
          Join
        </Button>
      </form>
    );
    fireEvent.click(screen.getByRole('button'));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('restores activation once loading ends', () => {
    const onClick = vi.fn();
    const { rerender } = render(
      <Button loading onClick={onClick}>
        Save
      </Button>
    );
    rerender(<Button onClick={onClick}>Save</Button>);
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button')).not.toHaveAttribute('aria-disabled');
  });

  it('keeps native disabled when the caller disables it explicitly', () => {
    render(
      <Button loading disabled>
        Save
      </Button>
    );
    expect(screen.getByRole('button')).toBeDisabled();
  });
});
