import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ProviderCell } from '@/components/dashboard/organisms/releases/cells/ProviderCell';
import type { ProviderKey, ReleaseViewModel } from '@/lib/discography/types';

vi.mock('@/lib/utils/platform-detection', () => ({
  getBaseUrl: () => 'https://jov.ie',
}));

describe('ProviderCell actions', () => {
  const release: ReleaseViewModel = {
    profileId: 'profile-1',
    id: 'release-1',
    title: 'Midnight Signal',
    releaseDate: '2026-01-01',
    artworkUrl: 'https://example.com/art.jpg',
    slug: 'midnight-signal',
    smartLinkPath: '/r/midnight-signal',
    providers: [
      {
        key: 'spotify' as ProviderKey,
        url: 'https://open.spotify.com/track/abc',
        path: '/r/midnight-signal?utm_source=spotify',
        label: 'Spotify',
        isPrimary: true,
        source: 'ingested',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ],
    releaseType: 'single',
    isExplicit: false,
    totalTracks: 1,
  };

  it('does not bubble open/copy clicks to parent row handlers', () => {
    const parentClick = vi.fn();
    const onCopy = vi.fn().mockResolvedValue('copied');
    const openSpy = vi.spyOn(globalThis, 'open').mockImplementation(() => null);

    render(
      <table>
        <tbody>
          <tr onClick={parentClick}>
            <td>
              <ProviderCell
                release={release}
                provider={'spotify' as ProviderKey}
                config={{ label: 'Spotify', accent: '#22c55e' }}
                onCopy={onCopy}
              />
            </td>
          </tr>
        </tbody>
      </table>
    );

    const [openButton, copyButton] = screen.getAllByRole('button');
    fireEvent.click(openButton);
    fireEvent.click(copyButton);

    expect(parentClick).not.toHaveBeenCalled();
    expect(openSpy).toHaveBeenCalledWith(
      'https://open.spotify.com/track/abc',
      '_blank',
      'noopener,noreferrer'
    );
    expect(onCopy).toHaveBeenCalledTimes(1);

    openSpy.mockRestore();
  });
});
