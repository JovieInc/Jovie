import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { CreateIdentityDialog } from './CreateProfileDialog';

const { mockRefresh, mockToastSuccess, mockOnOpenChange } = vi.hoisted(() => ({
  mockRefresh: vi.fn(),
  mockToastSuccess: vi.fn(),
  mockOnOpenChange: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}));

vi.mock('@/components/feedback', () => ({
  toast: { success: mockToastSuccess },
}));

const fetchMock = vi.fn();

function renderDialog() {
  return render(
    <CreateIdentityDialog open={true} onOpenChange={mockOnOpenChange} />
  );
}

describe('CreateIdentityDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockResolvedValue({
      json: async () => ({ success: true, profileId: 'profile_new' }),
    });
  });

  it('names the surface as artist identity and gates submission on both fields', async () => {
    const user = userEvent.setup();
    renderDialog();

    expect(
      screen.getByRole('heading', { name: 'Add Artist Identity' })
    ).toBeInTheDocument();

    const submit = screen.getByRole('button', { name: 'Create Identity' });
    expect(submit).toBeDisabled();

    await user.type(screen.getByLabelText('Display Name'), 'Second Act');
    expect(submit).toBeDisabled();

    await user.type(screen.getByLabelText('Username'), 'second act');
    expect(screen.getByLabelText('Username')).toHaveValue('second-act');
    expect(submit).toBeEnabled();
  });

  it('posts the trimmed identity payload and refreshes on success', async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.type(screen.getByLabelText('Display Name'), '  Second Act  ');
    await user.type(screen.getByLabelText('Username'), 'secondact');
    await user.click(screen.getByRole('button', { name: 'Create Identity' }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/dashboard/profile/create',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            displayName: 'Second Act',
            username: 'secondact',
          }),
        })
      );
    });
    await waitFor(() => {
      expect(mockToastSuccess).toHaveBeenCalledWith('Identity created');
      expect(mockOnOpenChange).toHaveBeenCalledWith(false);
      expect(mockRefresh).toHaveBeenCalledTimes(1);
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows the server error inline and keeps the dialog open on failure', async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue({
      json: async () => ({ success: false, error: 'Username is taken' }),
    });
    renderDialog();

    await user.type(screen.getByLabelText('Display Name'), 'Second Act');
    await user.type(screen.getByLabelText('Username'), 'taken');
    await user.click(screen.getByRole('button', { name: 'Create Identity' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Username is taken');
    });
    // Raw red (#f72a36) misses 4.5:1 on both themes; error copy uses the
    // derived AA-safe -text token.
    expect(screen.getByRole('alert')).toHaveClass('text-error-text');
    expect(mockToastSuccess).not.toHaveBeenCalled();
    expect(mockRefresh).not.toHaveBeenCalled();
  });

  it('shows a generic error when the request itself fails', async () => {
    const user = userEvent.setup();
    fetchMock.mockRejectedValue(new Error('network down'));
    renderDialog();

    await user.type(screen.getByLabelText('Display Name'), 'Second Act');
    await user.type(screen.getByLabelText('Username'), 'secondact');
    await user.click(screen.getByRole('button', { name: 'Create Identity' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        "Couldn't create identity. Try again."
      );
    });
    expect(mockToastSuccess).not.toHaveBeenCalled();
  });

  it('focuses Display Name when the dialog opens, without autoFocus', async () => {
    const { rerender } = render(
      <CreateIdentityDialog open={false} onOpenChange={mockOnOpenChange} />
    );
    rerender(<CreateIdentityDialog open onOpenChange={mockOnOpenChange} />);

    const displayName = await screen.findByLabelText('Display Name');
    await waitFor(() => expect(displayName).toHaveFocus());
    expect(displayName).not.toHaveAttribute('autofocus');
    await expectNoA11yViolations(screen.getByRole('dialog'));
  });

  it('is axe-clean while saving and with an inline error', async () => {
    const user = userEvent.setup();
    let answer: (value: unknown) => void = () => {};
    fetchMock.mockReturnValue(
      new Promise(resolve => {
        answer = resolve;
      })
    );
    renderDialog();

    await user.type(screen.getByLabelText('Display Name'), 'Second Act');
    await user.type(screen.getByLabelText('Username'), 'taken');
    await user.click(screen.getByRole('button', { name: 'Create Identity' }));
    await waitFor(() =>
      expect(screen.getByLabelText('Display Name')).toBeDisabled()
    );
    await expectNoA11yViolations(screen.getByRole('dialog'));

    answer({
      json: async () => ({ success: false, error: 'Username is taken' }),
    });
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Username is taken'
    );
    await expectNoA11yViolations(screen.getByRole('dialog'));
  });
});
