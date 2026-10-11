import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps, ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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

vi.mock('@jovie/ui', () => ({
  Button: ({
    children,
    loading: _loading,
    variant: _variant,
    ...props
  }: ComponentProps<'button'> & {
    readonly loading?: boolean;
    readonly variant?: string;
  }) => (
    <button type='button' {...props}>
      {children}
    </button>
  ),
  Dialog: ({ children, open }: { children: ReactNode; open: boolean }) =>
    open ? <div>{children}</div> : null,
  DialogContent: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  DialogDescription: ({ children }: { children: ReactNode }) => (
    <p>{children}</p>
  ),
  DialogFooter: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  DialogHeader: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  DialogTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
  Input: (props: ComponentProps<'input'>) => <input {...props} />,
  Label: ({ children, htmlFor }: { children: ReactNode; htmlFor?: string }) => (
    <label htmlFor={htmlFor}>{children}</label>
  ),
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
});
