import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockBack = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    back: mockBack,
  }),
}));

import { AuthModalShell } from '@/components/auth/AuthModalShell';

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
