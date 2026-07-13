import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ReleaseEditDialog } from '@/features/dashboard/organisms/releases/ReleaseEditDialog';
import type { ProviderKey, ReleaseViewModel } from '@/lib/discography/types';

vi.mock('@/components/organisms/Dialog', () => ({
  Dialog: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogBody: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogActions: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  DialogDescription: ({ children }: { children: ReactNode }) => (
    <p>{children}</p>
  ),
  DialogTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
}));

vi.mock('@/components/atoms/Icon', () => ({
  Icon: ({ name }: { name: string }) => <span>{name}</span>,
}));

vi.mock('@/components/atoms/ImageWithFallback', () => ({
  ImageWithFallback: () => <div data-testid='release-artwork' />,
}));

vi.mock('@/components/atoms/ProviderIcon', () => ({
  ProviderIcon: ({ provider }: { provider: string }) => <span>{provider}</span>,
}));

vi.mock('@/components/molecules/drawer', () => ({
  DrawerButton: ({
    children,
    onClick,
    ...props
  }: {
    children: ReactNode;
    onClick?: () => void;
    [key: string]: unknown;
  }) => (
    <button type='button' onClick={onClick} {...props}>
      {children}
    </button>
  ),
  DrawerFormField: ({
    children,
    helperText,
  }: {
    children: ReactNode;
    helperText?: ReactNode;
  }) => (
    <div>
      {children}
      {helperText}
    </div>
  ),
  DrawerSurfaceCard: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  EntityHeaderCard: ({
    title,
    subtitle,
    badge,
    image,
  }: {
    title: ReactNode;
    subtitle?: ReactNode;
    badge?: ReactNode;
    image?: ReactNode;
  }) => (
    <div>
      {image}
      <div>{title}</div>
      <div>{subtitle}</div>
      {badge}
    </div>
  ),
}));

vi.mock('@jovie/ui', () => ({
  Badge: ({
    children,
    ...props
  }: {
    children: ReactNode;
    [key: string]: unknown;
  }) => <span {...props}>{children}</span>,
  Input: ({
    value,
    onChange,
    ...props
  }: {
    value?: string;
    onChange?: (event: React.ChangeEvent<HTMLInputElement>) => void;
    [key: string]: unknown;
  }) => <input value={value} onChange={onChange} {...props} />,
}));

function createRelease(): ReleaseViewModel {
  return {
    profileId: 'profile-1',
    id: 'release-1',
    title: 'Skyline Dreams',
    slug: 'skyline-dreams',
    releaseType: 'single',
    isExplicit: false,
    releaseDate: '2026-06-15',
    artworkUrl: undefined,
    totalTracks: 1,
    providers: [
      {
        key: 'spotify',
        url: 'https://open.spotify.com/album/1',
        source: 'manual',
        updatedAt: '2026-01-01T00:00:00.000Z',
        label: 'Spotify',
        path: '/spotify',
        isPrimary: true,
      },
    ],
    spotifyPopularity: null,
    smartLinkPath: '/smart/release-1',
    previewUrl: null,
    primaryIsrc: null,
    upc: null,
  };
}

describe('ReleaseEditDialog', () => {
  it('renders release metadata and the manual override badge', () => {
    render(
      <ReleaseEditDialog
        release={createRelease()}
        providerList={[
          {
            key: 'spotify',
            label: 'Spotify',
            accent: '#1DB954',
            isPrimary: true,
          },
        ]}
        drafts={{ spotify: 'https://open.spotify.com/album/1' }}
        isSaving={false}
        onDraftChange={vi.fn()}
        onSave={vi.fn()}
        onReset={vi.fn()}
        onClose={vi.fn()}
      />
    );

    expect(screen.getByText('Edit release links')).toBeInTheDocument();
    expect(screen.getByText('Skyline Dreams')).toBeInTheDocument();
    expect(screen.getByText('Manual')).toBeInTheDocument();
    expect(
      screen.getByDisplayValue('https://open.spotify.com/album/1')
    ).toBeInTheDocument();
  });

  it('wires save, reset, and close actions', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    const onReset = vi.fn();
    const onClose = vi.fn();

    render(
      <ReleaseEditDialog
        release={createRelease()}
        providerList={[
          {
            key: 'spotify' as ProviderKey,
            label: 'Spotify',
            accent: '#1DB954',
            isPrimary: true,
          },
        ]}
        drafts={{ spotify: 'https://open.spotify.com/album/1' }}
        isSaving={false}
        onDraftChange={vi.fn()}
        onSave={onSave}
        onReset={onReset}
        onClose={onClose}
      />
    );

    await user.click(screen.getByTestId('save-provider-release-1-spotify'));
    await user.click(screen.getByTestId('reset-provider-release-1-spotify'));
    await user.click(screen.getByRole('button', { name: 'Done' }));

    expect(onSave).toHaveBeenCalledWith('spotify');
    expect(onReset).toHaveBeenCalledWith('spotify');
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
