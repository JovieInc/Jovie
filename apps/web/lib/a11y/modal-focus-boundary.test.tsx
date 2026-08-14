import { fireEvent, render, screen } from '@testing-library/react';
import { useRef, useState } from 'react';
import { describe, expect, it } from 'vitest';
import { useModalFocusBoundary } from './modal-focus-boundary';

function BoundaryHarness() {
  const [open, setOpen] = useState(false);
  const modalRef = useRef<HTMLDivElement | null>(null);
  useModalFocusBoundary(modalRef, open);

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

describe('useModalFocusBoundary', () => {
  it('isolates background content, traps tab focus, and returns focus on close', () => {
    render(<BoundaryHarness />);
    const trigger = screen.getByRole('button', { name: 'Open' });
    trigger.focus();
    fireEvent.click(trigger);

    expect(
      screen.getByRole('dialog', { name: 'Test Modal' })
    ).toBeInTheDocument();
    const backdrop = screen.getByRole('button', { name: 'Backdrop' });
    const background = backdrop.previousElementSibling as HTMLElement;
    const first = screen.getByRole('button', { name: 'First' });
    const close = screen.getByRole('button', { name: 'Close' });

    expect(background).toHaveAttribute('inert');
    expect(background).toHaveAttribute('aria-hidden', 'true');
    expect(backdrop).not.toHaveAttribute('inert');
    expect(backdrop).not.toHaveAttribute('aria-hidden');
    expect(first).toHaveFocus();

    close.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(first).toHaveFocus();
    first.focus();
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(close).toHaveFocus();

    fireEvent.click(close);
    expect(trigger).toHaveFocus();
    expect(trigger).not.toHaveAttribute('inert');
    expect(trigger).not.toHaveAttribute('aria-hidden');
  });
});
