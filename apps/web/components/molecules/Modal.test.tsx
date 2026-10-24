import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Modal } from './Modal';

const showModal = HTMLDialogElement.prototype.showModal;
const close = HTMLDialogElement.prototype.close;

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = vi.fn(function (
    this: HTMLDialogElement
  ) {
    this.open = true;
    this.querySelector<HTMLElement>('button')?.focus();
  });
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
    this.open = false;
  });
});
afterEach(() => {
  cleanup();
  HTMLDialogElement.prototype.showModal = showModal;
  HTMLDialogElement.prototype.close = close;
});

function RerenderHarness() {
  const [open, setOpen] = useState(false);
  const [revision, setRevision] = useState(0);
  return (
    <div>
      <button type='button' onClick={() => setOpen(true)}>
        Open modal
      </button>
      {open ? (
        <Modal aria-label='Test dialog' onDismiss={() => setOpen(false)}>
          <button type='button' onClick={() => setRevision(value => value + 1)}>
            Revision {revision}
          </button>
        </Modal>
      ) : null}
    </div>
  );
}

describe('Modal', () => {
  it('restores the original opener after its dismissal callback changes during a rerender', () => {
    render(<RerenderHarness />);
    const opener = screen.getByRole('button', { name: 'Open modal' });
    opener.focus();
    fireEvent.click(opener);
    fireEvent.click(screen.getByRole('button', { name: 'Revision 0' }));
    expect(screen.getByRole('button', { name: 'Revision 1' })).toHaveFocus();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });

  it('portals outside the page container and releases its native dialog on unmount', () => {
    const { container, unmount } = render(
      <Modal aria-label='Test dialog' onDismiss={vi.fn()}>
        <button type='button'>Continue</button>
      </Modal>
    );
    const dialog = screen.getByRole('dialog', { name: 'Test dialog' });
    expect(dialog.parentElement).toBe(document.body);
    expect(container).not.toContainElement(dialog);
    expect(dialog).toHaveAttribute('open');
    expect(document.body.style.overflow).toBe('hidden');
    unmount();
    expect(HTMLDialogElement.prototype.close).toHaveBeenCalledOnce();
    expect(document.body.style.overflow).toBe('');
  });

  it('dismisses on native cancellation and backdrop but keeps content clicks inside', () => {
    const dismiss = vi.fn();
    render(
      <Modal aria-label='Test dialog' onDismiss={dismiss}>
        <button type='button'>Continue</button>
      </Modal>
    );
    const dialog = screen.getByRole('dialog');
    fireEvent.mouseDown(screen.getByRole('button', { name: 'Continue' }));
    expect(dismiss).not.toHaveBeenCalled();
    const cancel = new Event('cancel', { cancelable: true });
    fireEvent(dialog, cancel);
    expect(cancel.defaultPrevented).toBe(true);
    expect(dismiss).toHaveBeenCalledTimes(1);
    fireEvent.mouseDown(dialog);
    expect(dismiss).toHaveBeenCalledTimes(2);
  });
});
