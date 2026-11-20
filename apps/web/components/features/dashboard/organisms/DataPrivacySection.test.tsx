import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { DataPrivacySection } from './DataPrivacySection';

const mocks = vi.hoisted(() => ({
  signOut: vi.fn(),
  exportMutate: vi.fn(),
  deleteMutateAsync: vi.fn(),
  exportPending: false,
  deletePending: false,
}));

vi.mock('@/hooks/useClerkSafe', () => ({
  useAuthSafe: () => ({ signOut: mocks.signOut }),
}));

vi.mock('@/lib/queries', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/queries')>()),
  useExportDataMutation: () => ({
    mutate: mocks.exportMutate,
    isPending: mocks.exportPending,
  }),
  useDeleteAccountMutation: () => ({
    mutateAsync: mocks.deleteMutateAsync,
    isPending: mocks.deletePending,
  }),
}));

vi.mock('@/lib/queries/useSettingsMutation', () => ({
  useUpdateSettingsMutation: () => ({ mutateAsync: vi.fn() }),
}));

function wrap(node: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={client}>{node}</QueryClientProvider>;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.exportPending = false;
  mocks.deletePending = false;
});

describe('DataPrivacySection', () => {
  it('starts a data export and shows the exporting state', async () => {
    const user = userEvent.setup();
    const { container, rerender } = render(wrap(<DataPrivacySection />));
    await user.click(screen.getByRole('button', { name: 'Export data' }));
    expect(mocks.exportMutate).toHaveBeenCalledTimes(1);
    await expectNoA11yViolations(container);

    mocks.exportPending = true;
    rerender(wrap(<DataPrivacySection />));
    expect(screen.getByRole('button', { name: 'Exporting...' })).toBeDisabled();
    await expectNoA11yViolations(container);
  });

  it('only deletes once DELETE is typed, then signs out', async () => {
    const user = userEvent.setup();
    mocks.deleteMutateAsync.mockResolvedValue(undefined);
    render(wrap(<DataPrivacySection />));
    await user.click(screen.getByRole('button', { name: 'Delete Account' }));

    const dialog = await screen.findByRole('alertdialog');
    const confirm = screen.getByRole('button', {
      name: 'Permanently Delete Account',
    });
    expect(confirm).toBeDisabled();

    await user.type(screen.getByLabelText(/to confirm/), 'DELETE');
    expect(confirm).toBeEnabled();
    await expectNoA11yViolations(dialog);
    await user.click(confirm);

    expect(mocks.deleteMutateAsync).toHaveBeenCalledWith({
      confirmation: 'DELETE',
    });
    await waitFor(() =>
      expect(mocks.signOut).toHaveBeenCalledWith({ redirectUrl: '/' })
    );
  });

  it('does not sign out when deletion fails', async () => {
    const user = userEvent.setup();
    mocks.deleteMutateAsync.mockRejectedValue(new Error('nope'));
    render(wrap(<DataPrivacySection />));
    await user.click(screen.getByRole('button', { name: 'Delete Account' }));
    await user.type(await screen.findByLabelText(/to confirm/), 'DELETE');
    await user.click(
      screen.getByRole('button', { name: 'Permanently Delete Account' })
    );
    await waitFor(() => expect(mocks.deleteMutateAsync).toHaveBeenCalled());
    expect(mocks.signOut).not.toHaveBeenCalled();
  });

  it('keeps the typed confirmation and focus through a parent rerender and blur', async () => {
    const user = userEvent.setup();
    const { rerender } = render(wrap(<DataPrivacySection />));
    await user.click(screen.getByRole('button', { name: 'Delete Account' }));
    const input = await screen.findByLabelText(/to confirm/);
    await user.type(input, 'DEL');

    rerender(wrap(<DataPrivacySection />));
    expect(screen.getByLabelText(/to confirm/)).toHaveValue('DEL');
    expect(screen.getByLabelText(/to confirm/)).toHaveFocus();

    screen.getByLabelText(/to confirm/).blur();
    expect(screen.getByLabelText(/to confirm/)).toHaveValue('DEL');
  });

  it('clears the confirmation when the dialog is cancelled', async () => {
    const user = userEvent.setup();
    render(wrap(<DataPrivacySection />));
    await user.click(screen.getByRole('button', { name: 'Delete Account' }));
    await user.type(await screen.findByLabelText(/to confirm/), 'DELETE');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() =>
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    );

    await user.click(screen.getByRole('button', { name: 'Delete Account' }));
    expect(await screen.findByLabelText(/to confirm/)).toHaveValue('');
  });

  it('renders right to left', async () => {
    const { container } = render(
      wrap(
        <div dir='rtl' lang='ar'>
          <DataPrivacySection />
        </div>
      )
    );
    expect(screen.getByText('Delete your account')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('shows young-audience and discovery toggles for the selected profile', async () => {
    const artist = {
      id: 'owner-profile',
      owner_user_id: 'owner',
      handle: 'artist',
      spotify_id: '',
      name: 'Artist',
      published: true,
      is_verified: false,
      is_featured: false,
      marketing_opt_out: false,
      created_at: '2026-10-17T00:00:00Z',
      settings: { searchable: false, youngAudience: false },
    };
    const { container } = render(wrap(<DataPrivacySection artist={artist} />));
    expect(
      screen.getByRole('switch', { name: 'Young audience' })
    ).not.toBeChecked();
    expect(
      screen.getByRole('switch', { name: 'Show in Jovie discovery' })
    ).not.toBeChecked();
    await expectNoA11yViolations(container);
  });
});
