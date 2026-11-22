import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { AddReleaseSidebar } from './AddReleaseSidebar';

const createRelease = vi.hoisted(() => vi.fn());

vi.mock('@/app/app/(shell)/dashboard/releases/actions', () => ({
  createRelease,
}));

vi.mock('@/components/feedback', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
  },
}));

const baseProps = {
  isOpen: true,
  artistName: 'Sasha Waves',
  onClose: vi.fn(),
  onCreated: vi.fn(),
};

describe('AddReleaseSidebar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('focuses the title when open, keeps typed text across a rerender, and has no a11y violations', async () => {
    const user = userEvent.setup();
    const { container, rerender } = render(
      <AddReleaseSidebar {...baseProps} />
    );
    const title = screen.getByLabelText('Title');
    await waitFor(() => expect(title).toHaveFocus());

    await user.type(title, 'Night Drive');
    rerender(<AddReleaseSidebar {...baseProps} artistName='Sasha Waves' />);
    await user.tab();

    expect(screen.getByLabelText('Title')).toHaveValue('Night Drive');
    await expectNoA11yViolations(container);
  });

  it('keeps Create Release disabled until a title exists, then submits it', async () => {
    const user = userEvent.setup();
    createRelease.mockResolvedValue({ success: false, message: 'No' });
    render(<AddReleaseSidebar {...baseProps} />);

    const create = screen.getByRole('button', { name: 'Create Release' });
    expect(create).toBeDisabled();

    await user.type(screen.getByLabelText('Title'), '  Night Drive  ');
    expect(create).toBeEnabled();
    await user.click(create);

    await waitFor(() =>
      expect(createRelease).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Night Drive', releaseType: 'single' })
      )
    );
    expect(baseProps.onCreated).not.toHaveBeenCalled();
  });

  it('starts a fresh form after the drawer closes and reopens', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<AddReleaseSidebar {...baseProps} />);
    await user.type(screen.getByLabelText('Title'), 'Night Drive');

    rerender(<AddReleaseSidebar {...baseProps} isOpen={false} />);
    rerender(<AddReleaseSidebar {...baseProps} isOpen />);

    expect(screen.getByLabelText('Title')).toHaveValue('');
  });

  it('shows the placeholder artist copy when no artist is selected', () => {
    render(<AddReleaseSidebar {...baseProps} artistName={null} />);

    expect(screen.getByText('No artist selected')).toBeInTheDocument();
  });
});
