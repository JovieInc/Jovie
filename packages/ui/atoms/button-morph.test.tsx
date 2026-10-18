import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Button } from './button';

describe('Button pill state choreography', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    const compute = globalThis.getComputedStyle;
    vi.spyOn(globalThis, 'getComputedStyle').mockImplementation(element => {
      const styles = compute(element);
      const property = styles.getPropertyValue.bind(styles);
      styles.getPropertyValue = name =>
        name === '--duration-subtle' ? '150ms' : property(name);
      return styles;
    });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('retains focus and its name, blocks duplicate submits, and has one live owner', () => {
    const action = vi.fn();
    const { rerender } = render(
      <Button pendingPresentation='morph' onClick={action}>
        Save changes
      </Button>
    );
    const button = screen.getByRole('button', { name: 'Save changes' });
    button.focus();
    fireEvent.click(button, { detail: 1 });
    rerender(
      <Button pendingPresentation='morph' loading onClick={action}>
        Save changes
      </Button>
    );
    fireEvent.click(button);
    fireEvent.keyDown(button, { key: 'Enter' });
    fireEvent.click(button);
    expect(action).toHaveBeenCalledTimes(1);
    expect(button).toHaveFocus();
    expect(button).not.toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(button).toHaveAccessibleName('Save changes');
    expect(screen.getAllByRole('status')).toHaveLength(1);
    expect(screen.getByRole('status')).toHaveTextContent('Loading');
    const spinner = button.querySelector('[data-part=morph-spinner]');
    expect(spinner).toHaveStyle({ opacity: 0 });
    act(() => vi.advanceTimersByTime(150));
    expect(spinner).toHaveStyle({ opacity: 1 });
    rerender(
      <Button pendingPresentation='morph' actionState='success'>
        Save changes
      </Button>
    );
    expect(screen.getByRole('status')).toHaveTextContent('Complete');
    expect(button.querySelector('[data-part=morph-check]')).toHaveStyle({
      opacity: 1,
    });
    expect(button).toHaveFocus();
  });

  it('reverses through error and keyboard retry without movement latency', () => {
    const retry = vi.fn();
    const { rerender } = render(
      <Button pendingPresentation='morph' actionState='pending'>
        Publish
      </Button>
    );
    rerender(
      <Button pendingPresentation='morph' actionState='error' onClick={retry}>
        Publish
      </Button>
    );
    const button = screen.getByRole('button', {
      name: 'Could not complete. Retry',
    });
    expect(screen.getByRole('status')).toHaveTextContent(
      'Could not complete. Retry'
    );
    button.focus();
    fireEvent.keyDown(button, { key: ' ' });
    fireEvent.click(button);
    expect(retry).toHaveBeenCalledOnce();
    rerender(
      <Button pendingPresentation='morph' actionState='pending'>
        Publish
      </Button>
    );
    expect(button).toHaveAttribute('data-keyboard', 'true');
    expect(button.querySelector('[data-part=morph-surface]')).toHaveStyle({
      transitionProperty: 'none',
    });
    expect(button).toHaveFocus();
  });

  it('cancels presentation timers on rapid reversals and unmount', () => {
    const { rerender, unmount } = render(
      <Button pendingPresentation='morph' loading>
        Save
      </Button>
    );
    act(() => vi.advanceTimersByTime(50));
    rerender(
      <Button pendingPresentation='morph' actionState='success'>
        Save
      </Button>
    );
    act(() => vi.advanceTimersByTime(200));
    expect(screen.queryByTestId('spinner')).not.toBeInTheDocument();
    rerender(
      <Button pendingPresentation='morph' loading>
        Save
      </Button>
    );
    expect(screen.getByTestId('spinner').parentElement).toHaveStyle({
      opacity: 0,
    });
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('keeps the opt-in bounded to text pills and respects explicit disabled state', () => {
    const { rerender } = render(<Button loading>Legacy</Button>);
    expect(screen.getByRole('button')).toBeDisabled();
    expect(screen.getByRole('button')).not.toHaveAttribute(
      'data-pending-presentation'
    );
    rerender(
      <Button pendingPresentation='morph' size='icon' loading aria-label='Save'>
        S
      </Button>
    );
    expect(screen.getByRole('button')).not.toHaveAttribute(
      'data-pending-presentation'
    );
    rerender(
      <Button pendingPresentation='morph' disabled>
        Save
      </Button>
    );
    expect(screen.getByRole('button')).toBeDisabled();
    rerender(
      <Button pendingPresentation='morph' asChild>
        <a href='#save'>Save</a>
      </Button>
    );
    expect(screen.getByRole('link')).not.toHaveAttribute(
      'data-pending-presentation'
    );
  });

  it('retains destructive foreground contrast on a pending primary action', () => {
    render(
      <Button pendingPresentation='morph' destructive loading>
        Delete
      </Button>
    );
    expect(screen.getByTestId('spinner')).toHaveClass('text-error-foreground');
    expect(screen.getByRole('button')).toHaveAttribute(
      'data-destructive',
      'true'
    );
  });
});
