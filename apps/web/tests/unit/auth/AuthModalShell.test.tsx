import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockBack = vi.fn();
const mockPush = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    back: mockBack,
    push: mockPush,
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
    mockPush.mockReset();
    // jsdom doesn't implement the native dialog API used by showModal().
    HTMLDialogElement.prototype.showModal = vi.fn(function showModalMock(
      this: HTMLDialogElement
    ) {
      // Native showModal opens the dialog before focusing its contents.
      // A closed dialog correctly rejects focus in jsdom 30.1.2.
      this.open = true;
      this.querySelector<HTMLElement>('button')?.focus();
    });
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

  it('paints the modal surface with the defined bg-base theme token', () => {
    const { container } = render(
      <AuthModalShell ariaLabel='Create your Jovie account'>
        <div>Modal auth form</div>
      </AuthModalShell>
    );

    const shell = container.querySelector('[data-auth-modal-shell]');
    // bg-background has no --color-background token and emits no CSS, which
    // left the modal without a page background.
    expect(shell).toHaveClass('bg-base', 'sm:bg-(--color-bg-base)/96');
    expect(shell).not.toHaveClass('bg-background');
    expect(shell).not.toHaveClass('sm:bg-background/96');
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
    expect(mockPush).not.toHaveBeenCalled();
  });

  // JOV-6225: the visible back control is destination navigation, bound to
  // the same validated context as its label — never history-dependent.
  it('navigates the default back control to the homepage instead of history', () => {
    render(
      <AuthModalShell>
        <div>body</div>
      </AuthModalShell>
    );

    fireEvent.click(screen.getByLabelText('Back to homepage'));

    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith('/');
    expect(mockBack).not.toHaveBeenCalled();
  });

  it('navigates a caller-supplied destination to exactly that path', () => {
    render(
      <AuthModalShell
        backButtonLabel='Back to chat'
        backDestination='/start?intent_id=abc'
      >
        <div>body</div>
      </AuthModalShell>
    );

    fireEvent.click(screen.getByLabelText('Back to chat'));

    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith('/start?intent_id=abc');
    expect(mockBack).not.toHaveBeenCalled();
  });

  it('navigates the claim back link to the claim surface with context intact', () => {
    render(
      <AuthModalShell
        backButtonLabel='Back to @aria'
        backDestination='/aria?claim=1'
      >
        <div>body</div>
      </AuthModalShell>
    );

    fireEvent.click(screen.getByLabelText('Back to @aria'));

    expect(mockPush).toHaveBeenCalledWith('/aria?claim=1');
    expect(mockBack).not.toHaveBeenCalled();
  });

  it.each([
    '//evil.com',
    '/%2fevil.com',
    '/%5cevil.com',
    '/\t/evil.com',
    '/%09/evil.com',
    '/%0a/evil.com',
    'https://evil.com',
    '/redirect#fragment\\..\\evil',
    '\\\\evil.com',
  ])(
    'refuses an unsafe backDestination (%j) and degrades to dismissal',
    unsafe => {
      render(
        <AuthModalShell backDestination={unsafe}>
          <div>body</div>
        </AuthModalShell>
      );

      fireEvent.click(screen.getByLabelText('Back to homepage'));

      expect(mockPush).not.toHaveBeenCalled();
      expect(mockBack).toHaveBeenCalledTimes(1);
    }
  );

  it('degrades an unknown-label back control without a destination to dismissal', () => {
    // A label the shell cannot bind to a validated destination must not
    // guess a route — it falls back to the modal-dismiss path.
    render(
      <AuthModalShell backButtonLabel='Back somewhere'>
        <div>body</div>
      </AuthModalShell>
    );

    fireEvent.click(screen.getByLabelText('Back somewhere'));

    expect(mockPush).not.toHaveBeenCalled();
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it.each(['constructor', 'toString', '__proto__'])(
    'dismisses an inherited label key %j safely',
    label => {
      render(
        <AuthModalShell backButtonLabel={label}>
          <div>body</div>
        </AuthModalShell>
      );
      fireEvent.click(screen.getByLabelText(label));
      expect(mockPush).not.toHaveBeenCalled();
      expect(mockBack).toHaveBeenCalledTimes(1);
    }
  );

  it('keeps Escape dismissal separate from destination navigation', () => {
    // Escape/backdrop are modal-DISMISSAL (history pop of the intercepted
    // route) and must never navigate to the back destination.
    const { container } = render(
      <AuthModalShell backDestination='/start'>
        <div>body</div>
      </AuthModalShell>
    );

    const dialog = container.querySelector('dialog');
    expect(dialog).not.toBeNull();

    fireEvent(dialog!, new Event('cancel', { cancelable: true }));
    fireEvent.mouseDown(dialog!);

    expect(mockBack).toHaveBeenCalledTimes(2);
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('defaults the back control to an explicit Back to homepage destination', () => {
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
    expect(screen.getByLabelText('Back to homepage')).toBeInTheDocument();
    expect(screen.getByText('Back to homepage')).toBeInTheDocument();
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
    expect(dialog).toHaveAttribute('open');
    expect(document.body.style.overflow).toBe('hidden');
    expect(document.documentElement.style.overscrollBehavior).toBe('contain');

    const backButton = screen.getByLabelText('Back to homepage');
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

  it.each(['', '   ', '\t\n'])(
    'falls back to "Back to homepage" when backButtonLabel is whitespace-only (%j)',
    emptyish => {
      // Guards the render-time fallback added in c9ae3ce. An empty or
      // whitespace-only aria-label would otherwise leave the button
      // unlabeled for assistive tech.
      render(
        <AuthModalShell backButtonLabel={emptyish}>
          <div>body</div>
        </AuthModalShell>
      );

      expect(screen.getByLabelText('Back to homepage')).toBeInTheDocument();
    }
  );
});
