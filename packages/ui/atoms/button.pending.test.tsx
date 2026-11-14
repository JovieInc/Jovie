import { fireEvent, render, screen } from '@testing-library/react';
import * as React from 'react';
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

describe.each(['spinner', 'morph'] as const)(
  'Button %s caller contracts',
  pendingPresentation => {
    it.each(['object', 'callback'] as const)(
      'forwards %s refs to the focused button through pending and unmount',
      refKind => {
        const objectRef = React.createRef<HTMLButtonElement>();
        const callbackRef = vi.fn((_node: HTMLButtonElement | null) => {});
        const ref = refKind === 'object' ? objectRef : callbackRef;
        const current = () =>
          refKind === 'object'
            ? objectRef.current
            : (callbackRef.mock.lastCall?.[0] ?? null);
        const { rerender, unmount } = render(
          <Button ref={ref} pendingPresentation={pendingPresentation}>
            Save release
          </Button>
        );
        const button = screen.getByRole('button', { name: 'Save release' });
        expect(current()).toBe(button);
        current()?.focus();
        expect(button).toHaveFocus();

        rerender(
          <Button ref={ref} pendingPresentation={pendingPresentation} loading>
            Save release
          </Button>
        );
        expect(current()).toBe(button);
        expect(button).toHaveFocus();
        expect(button).not.toBeDisabled();
        unmount();
        expect(current()).toBeNull();
      }
    );

    it('keeps the caller external label as its accessible name while pending', () => {
      const view = (loading: boolean) => (
        <>
          <span id='release-action-name'>Save release artwork</span>
          <Button
            pendingPresentation={pendingPresentation}
            aria-labelledby='release-action-name'
            loading={loading}
          >
            Save
          </Button>
        </>
      );
      const { rerender } = render(view(false));
      const button = screen.getByRole('button', {
        name: 'Save release artwork',
      });
      button.focus();
      rerender(view(true));
      expect(button).toHaveAccessibleName('Save release artwork');
      expect(button).toHaveFocus();
    });

    it('preserves a caller aria-label instead of replacing it with child copy', () => {
      const { rerender } = render(
        <Button
          pendingPresentation={pendingPresentation}
          aria-label='Save release metadata'
        >
          Save
        </Button>
      );
      const button = screen.getByRole('button', {
        name: 'Save release metadata',
      });
      rerender(
        <Button
          pendingPresentation={pendingPresentation}
          aria-label='Save release metadata'
          loading
        >
          Save
        </Button>
      );
      expect(button).toHaveAccessibleName('Save release metadata');
    });

    it('forwards idle ARIA flags and makes pending authoritative without losing focus', () => {
      const view = (loading: boolean, busy: boolean) => (
        <Button
          pendingPresentation={pendingPresentation}
          loading={loading}
          aria-busy={busy}
          aria-disabled={false}
        >
          Save
        </Button>
      );
      const { rerender } = render(view(false, false));
      const button = screen.getByRole('button', { name: 'Save' });
      button.focus();
      expect(button).toHaveAttribute('aria-busy', 'false');
      expect(button).toHaveAttribute('aria-disabled', 'false');
      rerender(view(false, true));
      expect(button).toHaveAttribute('aria-busy', 'true');
      expect(button).toHaveAttribute('aria-disabled', 'false');
      rerender(view(true, false));
      expect(button).toHaveAttribute('aria-busy', 'true');
      expect(button).toHaveAttribute('aria-disabled', 'true');
      expect(button).not.toBeDisabled();
      expect(button).toHaveFocus();
    });

    it('composes pointer, keyboard and click handlers with caller cancellation', () => {
      const order: string[] = [];
      const submit = vi.fn((event: React.FormEvent) => event.preventDefault());
      const { getByRole } = render(
        <form onSubmit={submit}>
          <Button
            pendingPresentation={pendingPresentation}
            type='submit'
            onPointerDown={event => {
              expect(event.currentTarget).toBe(button);
              order.push('pointer');
              event.preventDefault();
            }}
            onKeyDown={event => {
              expect(event.currentTarget).toBe(button);
              order.push(`key:${event.key}`);
              event.preventDefault();
            }}
            onClickCapture={event => {
              expect(event.currentTarget).toBe(button);
              order.push('capture');
              event.preventDefault();
            }}
            onClick={event => {
              expect(event.currentTarget).toBe(button);
              expect(event.defaultPrevented).toBe(true);
              order.push('bubble');
            }}
          >
            Publish
          </Button>
        </form>
      );
      const button = getByRole('button', { name: 'Publish' });
      expect(fireEvent.pointerDown(button)).toBe(false);
      expect(fireEvent.keyDown(button, { key: 'Enter' })).toBe(false);
      expect(fireEvent.click(button, { detail: 0 })).toBe(false);
      expect(order).toEqual(['pointer', 'key:Enter', 'capture', 'bubble']);
      expect(submit).not.toHaveBeenCalled();
    });
  }
);
