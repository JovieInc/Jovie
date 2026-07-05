import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LibraryShareDropSurface } from '@/components/features/library-share/LibraryShareDropSurface';
import type { LibraryShareDropPublicView } from '@/lib/library-share/types';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

const baseView: LibraryShareDropPublicView = {
  token: 'drop-token',
  title: 'Label Review Pack',
  message: 'Assets for Friday listening.',
  layout: 'grid',
  downloadsEnabled: true,
  requiresPassphrase: false,
  isExpired: false,
  artistName: 'Tim White',
  artistHandle: 'timwhite',
  artistAvatarUrl: null,
  accentColor: null,
  logoUrl: null,
  darkMode: true,
  assets: [
    {
      id: 'item-1',
      releaseId: 'release-1',
      title: 'Midnight Drive',
      artistName: 'Tim White',
      artworkUrl: null,
      previewUrl: null,
      lyrics: null,
      releaseType: 'single',
      releaseDate: null,
      smartLinkPath: '/timwhite/midnight-drive',
      includeArtwork: true,
      includePreview: false,
      includeLyrics: false,
    },
  ],
};

describe('LibraryShareDropSurface', () => {
  it('shows the passphrase gate when required', () => {
    render(
      <LibraryShareDropSurface
        view={{ ...baseView, requiresPassphrase: true }}
        initialUnlocked={false}
      />
    );

    expect(
      screen.getByTestId('library-share-passphrase-gate')
    ).toBeInTheDocument();
  });

  it('renders the branded drop surface when unlocked', () => {
    render(<LibraryShareDropSurface view={baseView} initialUnlocked />);

    expect(
      screen.getByTestId('library-share-drop-surface')
    ).toBeInTheDocument();
    expect(screen.getByText('Label Review Pack')).toBeInTheDocument();
    expect(
      screen.getByText('Assets for Friday listening.')
    ).toBeInTheDocument();
  });

  it('unlocks after a successful passphrase request', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true }),
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <LibraryShareDropSurface
        view={{ ...baseView, requiresPassphrase: true }}
        initialUnlocked={false}
      />
    );

    fireEvent.change(screen.getByLabelText('Passphrase'), {
      target: { value: 'label-review' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Unlock drop' }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/library/share-drops/drop-token/unlock',
        expect.objectContaining({ method: 'POST' })
      );
      expect(
        screen.getByTestId('library-share-drop-surface')
      ).toBeInTheDocument();
    });
  });
});
