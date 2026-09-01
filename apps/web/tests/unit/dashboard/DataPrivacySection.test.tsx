import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DataPrivacySection } from '@/components/features/dashboard/organisms/DataPrivacySection';

const { deleteMutationState, exportMutationState, mutateExport, signOut } =
  vi.hoisted(() => ({
    deleteMutationState: {
      isPending: false,
      mutateAsync: vi.fn(),
    },
    exportMutationState: {
      isPending: false,
    },
    mutateExport: vi.fn(),
    signOut: vi.fn(),
  }));

vi.mock('@/hooks/useClerkSafe', () => ({
  useAuthSafe: () => ({
    signOut,
  }),
}));

vi.mock('@/lib/queries', () => ({
  useDeleteAccountMutation: () => deleteMutationState,
  useExportDataMutation: () => ({
    mutate: mutateExport,
    isPending: exportMutationState.isPending,
  }),
}));

describe('DataPrivacySection', () => {
  beforeEach(() => {
    mutateExport.mockReset();
    signOut.mockReset();
    deleteMutationState.isPending = false;
    deleteMutationState.mutateAsync.mockReset();
    exportMutationState.isPending = false;
  });

  it('owns destructive settings-row tone for account deletion', () => {
    render(<DataPrivacySection />);

    const title = screen.getByText('Delete your account');
    const row = title.closest('[data-tone="destructive"]');

    expect(row).toHaveAttribute('data-state', 'idle');
    expect(title).toHaveClass('text-error');
    expect(
      screen.getByText(
        'Permanently remove your account, profile, contacts, and all associated data. This action cannot be undone.'
      )
    ).toHaveClass('text-secondary-token');
    expect(
      screen.getByRole('button', { name: 'Delete Account' })
    ).toBeEnabled();
  });

  it('keeps the data export action wired through the settings action row', () => {
    render(<DataPrivacySection />);

    fireEvent.click(screen.getByRole('button', { name: 'Export data' }));

    expect(mutateExport).toHaveBeenCalledOnce();
  });

  it('shows pending export state without disabling the descriptive row', () => {
    exportMutationState.isPending = true;

    render(<DataPrivacySection />);

    const exportTitle = screen.getByText('Export your data');
    const row = exportTitle.closest('[data-state="idle"]');

    expect(row).toHaveAttribute('data-tone', 'default');
    expect(exportTitle).toHaveClass('text-primary-token');
    expect(
      screen.getByRole('button', { name: 'Exporting...' })
    ).toBeDisabled();
  });
});
