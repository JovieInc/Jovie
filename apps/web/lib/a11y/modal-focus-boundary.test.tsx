import { fireEvent, render, screen } from '@testing-library/react';
import { useRef, useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  type ModalFocusBoundaryOptions,
  useModalFocusBoundary,
} from './modal-focus-boundary';

function BoundaryHarness({
  restoreFocusOrOptions = true,
}: {
  readonly restoreFocusOrOptions?: boolean | ModalFocusBoundaryOptions;
}) {
  const [open, setOpen] = useState(false);
  const modalRef = useRef<HTMLDivElement | null>(null);
  const options: boolean | ModalFocusBoundaryOptions =
    typeof restoreFocusOrOptions === 'boolean'
      ? restoreFocusOrOptions
      : {
          ...restoreFocusOrOptions,
          onDismiss: restoreFocusOrOptions.onDismiss ?? (() => setOpen(false)),
        };
  useModalFocusBoundary(modalRef, open, options);

  return (
    <div>
      <button type='button' onClick={() => setOpen(true)}>
        Open
      </button>
      {open ? (
        <>
          <button
            type='button'
            data-modal-backdrop
            onClick={() => setOpen(false)}
          >
            Backdrop
          </button>
          <div
            ref={modalRef}
            role='dialog'
            aria-modal='true'
            aria-label='Test Modal'
            tabIndex={-1}
          >
            <button type='button'>First</button>
            <button type='button' onClick={() => setOpen(false)}>
              Close
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}

function resetScrollLock() {
  document.body.style.removeProperty('overflow');
  document.body.style.removeProperty('overscroll-behavior');
  document.documentElement.style.removeProperty('overflow');
  document.documentElement.style.removeProperty('overscroll-behavior');
}

describe('useModalFocusBoundary', () => {
  afterEach(resetScrollLock);

  it('isolates background content, traps tab focus, and returns focus on close', () => {
    render(<BoundaryHarness />);
    const trigger = screen.getByRole('button', { name: 'Open' });
    trigger.focus();
    fireEvent.click(trigger);

    const backdrop = screen.getByRole('button', { name: 'Backdrop' });
    const background = backdrop.previousElementSibling as HTMLElement;
    const first = screen.getByRole('button', { name: 'First' });
    const close = screen.getByRole('button', { name: 'Close' });
    expect(background).toHaveAttribute('inert');
    expect(background).toHaveAttribute('aria-hidden', 'true');
    expect(backdrop).not.toHaveAttribute('inert');
    expect(first).toHaveFocus();

    close.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(first).toHaveFocus();
    first.focus();
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(close).toHaveFocus();
    fireEvent.click(close);
    expect(trigger).toHaveFocus();
  });

  it('dismisses the open dialog on Escape and restores the live opener', () => {
    render(<BoundaryHarness restoreFocusOrOptions={{ lockScroll: true }} />);
    const trigger = screen.getByRole('button', { name: 'Open' });
    trigger.focus();
    fireEvent.click(trigger);
    expect(document.body.style.overflow).toBe('hidden');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Test Modal' })).toBeNull();
    expect(trigger).toHaveFocus();
    expect(document.body.style.overflow).toBe('');
  });

  it('pulls escaped focus back into the topmost dialog', () => {
    render(<BoundaryHarness />);
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    const stray = document.createElement('button');
    document.body.append(stray);
    stray.focus();
    expect(screen.getByRole('button', { name: 'First' })).toHaveFocus();
    stray.remove();
  });

  it('closes only the topmost nested dialog on Escape', () => {
    function NestedHarness() {
      const [open, setOpen] = useState(true);
      const [nestedOpen, setNestedOpen] = useState(true);
      const parentRef = useRef<HTMLDivElement | null>(null);
      const nestedRef = useRef<HTMLDivElement | null>(null);
      useModalFocusBoundary(parentRef, open, {
        onDismiss: () => setOpen(false),
      });
      useModalFocusBoundary(nestedRef, nestedOpen, {
        onDismiss: () => setNestedOpen(false),
      });
      return (
        <div>
          {open ? (
            <div
              ref={parentRef}
              role='dialog'
              aria-modal='true'
              aria-label='Parent'
              tabIndex={-1}
            >
              <button type='button'>Parent action</button>
              {nestedOpen ? (
                <div
                  ref={nestedRef}
                  role='dialog'
                  aria-modal='true'
                  aria-label='Nested'
                  tabIndex={-1}
                >
                  <button type='button'>Nested action</button>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      );
    }

    render(<NestedHarness />);
    screen.getByRole('button', { name: 'Nested action' }).focus();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Nested' })).toBeNull();
    expect(screen.getByRole('dialog', { name: 'Parent' })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Parent' })).toBeNull();
  });
});
