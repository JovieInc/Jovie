import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthModalShell } from '@/components/auth/AuthModalShell';

const mockBack = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    back: mockBack,
  }),
}));

describe('AuthModalShell', () => {
  beforeEach(() => {
    mockBack.mockReset();
    HTMLDialogElement.prototype.showModal = vi.fn();
    HTMLDialogElement.prototype.close = vi.fn();
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
});
