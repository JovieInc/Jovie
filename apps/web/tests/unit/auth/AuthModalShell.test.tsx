import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockBack = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    back: mockBack,
  }),
}));

import { AuthModalShell } from '@/components/auth/AuthModalShell';

function AuthModalBoundaryHarness() {
  const [open, setOpen] = useState(false);

  return (
    <div>
      <button type='button' onClick={() => setOpen(true)}>
        Open auth modal
      </button>
      {open ? (
        <AuthModalShell>
          <button type='button' onClick={() => setOpen(false)}>
            Finish auth
          </button>
        </AuthModalShell>
      ) : null}
    </div>
  );
}

describe('AuthModalShell', () => {
  // Snapshot native dialog prototype methods at module load so we can restore
  // them between tests — otherwise the vi.fn() replacements would leak into
  // any later test file in the same worker process.
  const originalShowModal = HTMLDialogElement.prototype.showModal;
  const originalClose = HTMLDialogElement.prototype.close;

  beforeEach(() => {
    mockBack.mockReset();
    // jsdom doesn't implement the native dialog API used by showModal().
    HTMLDialogElement.prototype.showModal = vi.fn();
    HTMLDialogElement.prototype.close = vi.fn();
  });

  afterEach(() => {
    document.body.style.removeProperty('overflow');
    document.body.style.removeProperty('overscroll-behavior');
    document.documentElement.style.removeProperty('overflow');
    document.documentElement.style.removeProperty('overscroll-behavior');
    HTMLDialogElement.prototype.showModal = originalShowModal;
    HTMLDialogElement.prototype.close = originalClose;
  });

  it('renders the intercepted auth modal as a single auth surface', () => {
    const { container } = render(
      <AuthModalShell
        ariaLabel='Create your Jovie account'
        statusRow={<span>Continuing with “Test prompt”</span>}
      >
        <div>Modal auth form</div>
      </AuthModalShell>
    );

    expect(HTMLDialogElement.prototype.showModal).toHaveBeenCalled();
    expect(screen.getByText('Modal auth form')).toBeInTheDocument();
    expect(
      screen.getByText('Continuing with “Test prompt”')
    ).toBeInTheDocument();
    expect(
      container.querySelector('.auth-showcase-panel')
    ).not.toBeInTheDocument();
    expect(container.querySelector('[data-auth-modal-shell]')).toHaveAttribute(
      'data-auth-shell-kind',
      'intercepted-modal'
    );
  });

  it('dismisses through router.back when the backdrop is clicked', () => {
    const { container } = render(
      <AuthModalShell ariaLabel='Create your Jovie account'>
        <div>Modal auth form</div>
      </AuthModalShell>
    );

    const dialog = container.querySelector('dialog');
    expect(dialog).not.toBeNull();

    fireEvent.mouseDown(dialog!);

    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it('defaults the back button aria-label to a context-neutral "Go back"', () => {
    // jsdom's <dialog> without `open` hides descendants from the
    // accessibility tree, so query by label rather than by role.
    render(
      <AuthModalShell>
        <div>body</div>
      </AuthModalShell>
    );

    // The back button must not leak a caller-specific label (e.g. "Back to
    // chat") when no context was passed — it would mislead screen readers
    // when the modal is opened from profile claim, direct /signup, or the
    // dev unavailable card.
    expect(screen.getByLabelText('Go back')).toBeInTheDocument();
    expect(screen.queryByLabelText('Back to chat')).toBeNull();
  });

  it('honors a caller-supplied backButtonLabel', () => {
    render(
      <AuthModalShell backButtonLabel='Back to chat'>
        <div>body</div>
      </AuthModalShell>
    );

    expect(screen.getByLabelText('Back to chat')).toBeInTheDocument();
  });

  it('locks document scroll while the modal is mounted', () => {
    const { unmount } = render(
      <AuthModalShell>
        <div>body</div>
      </AuthModalShell>
    );

    expect(document.body.style.overflow).toBe('hidden');
    expect(document.body.style.overscrollBehavior).toBe('contain');
    expect(document.documentElement.style.overflow).toBe('hidden');
    expect(document.documentElement.style.overscrollBehavior).toBe('contain');

    unmount();

    expect(document.body.style.overflow).toBe('');
    expect(document.body.style.overscrollBehavior).toBe('');
    expect(document.documentElement.style.overflow).toBe('');
    expect(document.documentElement.style.overscrollBehavior).toBe('');
  });

  it('isolates background focus with the shared modal boundary and restores focus on close', async () => {
    const { container } = render(<AuthModalBoundaryHarness />);
    const trigger = screen.getByRole('button', { name: 'Open auth modal' });
    trigger.focus();

    fireEvent.click(trigger);

    const dialog = container.querySelector('[data-auth-modal-shell]');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(document.body.style.overflow).toBe('hidden');
    expect(document.documentElement.style.overscrollBehavior).toBe('contain');

    const backButton = screen.getByLabelText('Go back');
    await waitFor(() => expect(backButton).toHaveFocus());
    expect(trigger).toHaveAttribute('inert');
    expect(trigger).toHaveAttribute('aria-hidden', 'true');

    trigger.focus();
    await waitFor(() => expect(backButton).toHaveFocus());

    fireEvent.click(screen.getByText('Finish auth'));

    await waitFor(() =>
      expect(
        container.querySelector('[data-auth-modal-shell]')
      ).not.toBeInTheDocument()
    );
    expect(trigger).not.toHaveAttribute('inert');
    expect(trigger).not.toHaveAttribute('aria-hidden');
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(document.body.style.overflow).toBe('');
    expect(document.documentElement.style.overscrollBehavior).toBe('');
  });

  it.each([
    '',
    '   ',
    '\t\n',
  ])('falls back to "Go back" when backButtonLabel is whitespace-only (%j)', emptyish => {
    // Guards the render-time fallback added in c9ae3ce. An empty or
    // whitespace-only aria-label would otherwise leave the button
    // unlabeled for assistive tech.
    render(
      <AuthModalShell backButtonLabel={emptyish}>
        <div>body</div>
      </AuthModalShell>
    );

    expect(screen.getByLabelText('Go back')).toBeInTheDocument();
  });
});
