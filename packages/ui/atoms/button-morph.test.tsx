import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Button } from './button';

/**
 * Deterministic jsdom stand-in for intrinsic text layout (JOV-9035): a
 * pill's width derives from the widest text it reserves, at CHAR_PX per
 * character plus PADDING. Swapping the visible label (the pre-morph pay
 * button's "Loading…") changes this measure; a morph that reserves both
 * the idle label and the retry label keeps it byte-identical, which is
 * what the fixed-width pay-button boundingBox assertion proves.
 */
const GEOMETRY_CHAR_PX = 8;
const GEOMETRY_PADDING_PX = 32;

function measureIntrinsicRect(element: HTMLElement): DOMRect {
  const reservedTexts = Array.from(element.querySelectorAll('span'))
    .map(span => span.textContent ?? '')
    .filter(text => text.length > 0);
  const longest = reservedTexts.reduce(
    (max, text) => Math.max(max, text.length),
    0
  );
  return {
    width: GEOMETRY_PADDING_PX + longest * GEOMETRY_CHAR_PX,
    height: 44,
    top: 0,
    left: 0,
    right: GEOMETRY_PADDING_PX + longest * GEOMETRY_CHAR_PX,
    bottom: 44,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  } as DOMRect;
}

describe('Button pay-pill geometry (JOV-9035)', () => {
  let restoreRect: () => void;

  beforeEach(() => {
    const original = HTMLElement.prototype.getBoundingClientRect;
    const spy = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockImplementation(function (this: HTMLElement) {
        return measureIntrinsicRect(this);
      });
    restoreRect = () => {
      spy.mockRestore();
      void original;
    };
  });

  afterEach(() => {
    restoreRect();
  });

  it('keeps the pay button bounding box fixed across idle, pending and success', () => {
    const { rerender } = render(
      <Button
        pendingPresentation='morph'
        stateLabels={{
          pending: 'Opening checkout',
          success: 'Complete',
          error: 'Could not start checkout',
          retry: 'Try again',
        }}
      >
        Upgrade to Artist Presence
      </Button>
    );

    const idleRect = screen.getByRole('button').getBoundingClientRect();

    rerender(
      <Button
        pendingPresentation='morph'
        loading
        stateLabels={{
          pending: 'Opening checkout',
          success: 'Complete',
          error: 'Could not start checkout',
          retry: 'Try again',
        }}
      >
        Upgrade to Artist Presence
      </Button>
    );
    const pendingRect = screen.getByRole('button').getBoundingClientRect();

    rerender(
      <Button
        pendingPresentation='morph'
        actionState='success'
        stateLabels={{
          pending: 'Opening checkout',
          success: 'Complete',
          error: 'Could not start checkout',
          retry: 'Try again',
        }}
      >
        Upgrade to Artist Presence
      </Button>
    );
    const successRect = screen.getByRole('button').getBoundingClientRect();

    expect(Math.abs(idleRect.width - pendingRect.width)).toBeLessThanOrEqual(
      0.5
    );
    expect(Math.abs(idleRect.width - successRect.width)).toBeLessThanOrEqual(
      0.5
    );
    expect(Math.abs(idleRect.height - pendingRect.height)).toBeLessThanOrEqual(
      0.5
    );
    expect(Math.abs(idleRect.height - successRect.height)).toBeLessThanOrEqual(
      0.5
    );
    expect(idleRect.width).toBeGreaterThan(0);
  });

  it('announces pay states from one live owner while the accessible name stays the action', () => {
    const payLabels = {
      pending: 'Opening checkout',
      success: 'Complete',
      error: 'Could not start checkout',
      retry: 'Try again',
    };
    const { rerender } = render(
      <Button pendingPresentation='morph' stateLabels={payLabels}>
        Upgrade to Artist Presence
      </Button>
    );
    rerender(
      <Button pendingPresentation='morph' loading stateLabels={payLabels}>
        Upgrade to Artist Presence
      </Button>
    );
    expect(screen.getAllByRole('status')).toHaveLength(1);
    expect(screen.getByRole('button')).toHaveAccessibleName(
      'Upgrade to Artist Presence'
    );
    rerender(
      <Button
        pendingPresentation='morph'
        actionState='error'
        stateLabels={payLabels}
      >
        Upgrade to Artist Presence
      </Button>
    );
    expect(screen.getAllByRole('status')).toHaveLength(1);
    expect(screen.getByRole('button')).toHaveAccessibleName(
      'Could not start checkout Try again'
    );
  });
});

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
    expect(screen.getByTestId('spinner')).toHaveClass(
      'text-btn-destructive-foreground'
    );
    expect(screen.getByRole('button')).toHaveAttribute(
      'data-destructive',
      'true'
    );
  });
});
