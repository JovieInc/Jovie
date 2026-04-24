import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ back: vi.fn() }),
}));

import { AuthModalShell } from '@/components/auth/AuthModalShell';

describe('AuthModalShell', () => {
  beforeEach(() => {
    // jsdom doesn't implement the native dialog API used by showModal().
    HTMLDialogElement.prototype.showModal = vi.fn();
    HTMLDialogElement.prototype.close = vi.fn();
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
});
