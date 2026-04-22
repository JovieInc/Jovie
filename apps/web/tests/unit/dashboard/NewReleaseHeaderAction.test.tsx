import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { NewReleaseHeaderAction } from '@/features/dashboard/organisms/release-provider-matrix/NewReleaseHeaderAction';

// Radix portals its content by default; flatten the primitives for testing.
vi.mock('@jovie/ui', async importOriginal => {
  const actual = await importOriginal<typeof import('@jovie/ui')>();
  return {
    ...actual,
    DropdownMenu: ({ children }: { children: ReactNode }) => <>{children}</>,
    DropdownMenuTrigger: ({ children }: { children: ReactNode }) => (
      <>{children}</>
    ),
    DropdownMenuContent: ({ children }: { children: ReactNode }) => (
      <div role='menu'>{children}</div>
    ),
    DropdownMenuItem: ({
      children,
      onSelect,
      disabled,
      'data-testid': testId,
    }: {
      children: ReactNode;
      onSelect?: (event: Event) => void;
      disabled?: boolean;
      'data-testid'?: string;
    }) => (
      <button
        type='button'
        data-testid={testId}
        disabled={disabled}
        data-disabled={disabled ? '' : undefined}
        onClick={() => onSelect?.(new Event('select'))}
      >
        {children}
      </button>
    ),
  };
});

describe('NewReleaseHeaderAction', () => {
  it('renders a single Spotify sync button when manual creation is not allowed', () => {
    const onSyncSpotify = vi.fn();
    const onCreateManual = vi.fn();

    render(
      <NewReleaseHeaderAction
        canCreateManualReleases={false}
        onSyncSpotify={onSyncSpotify}
        onCreateManual={onCreateManual}
      />
    );

    const button = screen.getByRole('button', {
      name: 'Sync releases from Spotify',
    });
    expect(button).toBeInTheDocument();
    fireEvent.click(button);
    expect(onSyncSpotify).toHaveBeenCalledTimes(1);
    expect(onCreateManual).not.toHaveBeenCalled();
  });

  it('renders a "New release" dropdown trigger when manual creation is allowed', () => {
    render(
      <NewReleaseHeaderAction
        canCreateManualReleases
        onSyncSpotify={vi.fn()}
        onCreateManual={vi.fn()}
      />
    );

    expect(
      screen.getByRole('button', { name: 'Create a new release' })
    ).toBeInTheDocument();
    expect(screen.getByText('New release')).toBeInTheDocument();
  });

  it('fires onSyncSpotify when "Sync from Spotify" is chosen', () => {
    const onSyncSpotify = vi.fn();
    const onCreateManual = vi.fn();

    render(
      <NewReleaseHeaderAction
        canCreateManualReleases
        onSyncSpotify={onSyncSpotify}
        onCreateManual={onCreateManual}
      />
    );

    fireEvent.click(screen.getByTestId('new-release-sync-spotify'));
    expect(onSyncSpotify).toHaveBeenCalledTimes(1);
    expect(onCreateManual).not.toHaveBeenCalled();
  });

  it('fires onCreateManual when "Add manually" is chosen', () => {
    const onSyncSpotify = vi.fn();
    const onCreateManual = vi.fn();

    render(
      <NewReleaseHeaderAction
        canCreateManualReleases
        onSyncSpotify={onSyncSpotify}
        onCreateManual={onCreateManual}
      />
    );

    fireEvent.click(screen.getByTestId('new-release-add-manually'));
    expect(onCreateManual).toHaveBeenCalledTimes(1);
    expect(onSyncSpotify).not.toHaveBeenCalled();
  });

  it('disables the sync item while isSyncing is true', () => {
    render(
      <NewReleaseHeaderAction
        canCreateManualReleases
        isSyncing
        onSyncSpotify={vi.fn()}
        onCreateManual={vi.fn()}
      />
    );

    expect(screen.getByTestId('new-release-sync-spotify')).toBeDisabled();
  });
});
