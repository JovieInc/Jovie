import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ProviderKey, ReleaseViewModel } from '@/lib/discography/types';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import type { ReleaseProviderMatrixProps } from './types';

const matrixProps = vi.hoisted(() => ({
  last: null as ReleaseProviderMatrixProps | null,
}));

vi.mock('./ReleaseProviderMatrix', () => ({
  ReleaseProviderMatrix: (props: ReleaseProviderMatrixProps) => {
    matrixProps.last = props;
    return (
      <section aria-label='Releases'>
        <ul>
          {props.releases.map(release => (
            <li key={release.id}>{release.title}</li>
          ))}
        </ul>
        <button type='button' onClick={props.experienceAdapter?.onSync}>
          Sync
        </button>
        <button
          type='button'
          onClick={props.experienceAdapter?.onCreateRelease}
        >
          Create Release
        </button>
      </section>
    );
  },
}));

import { ReleasesExperience } from './ReleasesExperience';

const providerConfig = {
  spotify: { label: 'Spotify', accent: '#1DB954' },
  apple_music: { label: 'Apple Music', accent: '#FA243C' },
} as Record<ProviderKey, { label: string; accent: string }>;

const releases = [
  { id: 'release-1', title: 'Skyline Dreams' },
  { id: 'release-2', title: 'Low Tide' },
] as unknown as ReleaseViewModel[];

describe('ReleasesExperience', () => {
  it('forwards every prop to the release matrix unchanged', async () => {
    const user = userEvent.setup();
    const onSync = vi.fn();
    const onCreateRelease = vi.fn();
    const props: ReleaseProviderMatrixProps = {
      releases,
      providerConfig,
      primaryProviders: ['spotify', 'apple_music'],
      spotifyConnected: true,
      spotifyArtistName: 'Sasha Waves',
      appleMusicConnected: false,
      appleMusicArtistName: null,
      allowArtworkDownloads: true,
      initialImporting: true,
      initialTotalCount: 12,
      experienceAdapter: { mode: 'demo', onSync, onCreateRelease },
    };
    const { container } = render(<ReleasesExperience {...props} />);

    expect(matrixProps.last).toEqual(props);
    expect(matrixProps.last?.releases).toBe(releases);
    expect(matrixProps.last?.providerConfig).toBe(providerConfig);
    expect(screen.getByRole('region', { name: 'Releases' })).toBeVisible();
    expect(
      screen.getAllByRole('listitem').map(item => item.textContent)
    ).toEqual(['Skyline Dreams', 'Low Tide']);
    await expectNoA11yViolations(container);

    await user.click(screen.getByRole('button', { name: 'Sync' }));
    expect(onSync).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: 'Create Release' }));
    expect(onCreateRelease).toHaveBeenCalledTimes(1);
  });

  it('passes an empty catalog through without adding defaults', async () => {
    const { container } = render(
      <ReleasesExperience
        releases={[]}
        providerConfig={providerConfig}
        primaryProviders={['spotify']}
      />
    );

    expect(matrixProps.last).toEqual({
      releases: [],
      providerConfig,
      primaryProviders: ['spotify'],
    });
    expect(screen.queryAllByRole('listitem')).toHaveLength(0);
    await expectNoA11yViolations(container);
  });
});
