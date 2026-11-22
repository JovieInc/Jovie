import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { ReleaseTrackList } from './ReleaseTrackList';
import { release, track } from './releaseTrackList.test-fixtures';

const mocks = vi.hoisted(() => ({
  query: { isLoading: false, isFetching: false, isError: false },
  toggle: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/queries', () => ({ useReleaseTracksQuery: () => mocks.query }));
vi.mock('./useTrackAudioPlayer', () => ({
  useTrackAudioPlayer: () => ({
    playbackState: {
      activeTrackId: null,
      isPlaying: false,
      playbackStatus: 'idle',
    },
    toggleTrack: mocks.toggle,
  }),
}));

describe('ReleaseTrackList certification', () => {
  beforeEach(() => {
    mocks.query.isLoading = false;
    mocks.query.isError = false;
    mocks.toggle.mockClear();
  });
  it('plays and opens a track with the correct identity', async () => {
    const user = userEvent.setup();
    const onTrackClick = vi.fn();
    const { container } = render(
      <ReleaseTrackList
        release={release}
        tracksOverride={[track]}
        onTrackClick={onTrackClick}
      />
    );
    await user.click(
      screen.getByRole('button', { name: 'Track 1: Play Static Skies' })
    );
    expect(mocks.toggle).toHaveBeenCalledOnce();
    await user.click(
      screen.getByRole('button', {
        name: 'Open track details for Static Skies',
      })
    );
    expect(onTrackClick).toHaveBeenCalledWith(
      expect.objectContaining({ id: track.id, title: track.title })
    );
    await expectNoA11yViolations(container);
  });
  it('renders a long RTL track title accessibly', async () => {
    const title = 'أغنية بعنوان طويل في قائمة الألبوم';
    const { container } = render(
      <div dir='rtl'>
        <ReleaseTrackList
          release={release}
          tracksOverride={[{ ...track, title }]}
        />
      </div>
    );
    expect(screen.getByText(title)).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
  it.each(['loading', 'error', 'empty'] as const)(
    'renders the %s state accessibly',
    async state => {
      mocks.query.isLoading = state === 'loading';
      mocks.query.isError = state === 'error';
      const { container } = render(
        <ReleaseTrackList release={release} tracksOverride={[]} />
      );
      if (state === 'loading')
        expect(screen.getAllByTestId('release-track-skeleton')).toHaveLength(3);
      if (state === 'error')
        expect(screen.getByText('Failed to load tracks.')).toBeInTheDocument();
      if (state === 'empty')
        expect(
          screen.getByText('No track data available.')
        ).toBeInTheDocument();
      await expectNoA11yViolations(container);
    }
  );
});

describe('ReleaseTrackList play glyph', () => {
  it('draws the play triangle through PlayIcon (JOV-12568)', () => {
    const source = readFileSync(
      resolve(__dirname, './ReleaseTrackList.tsx'),
      'utf8'
    );

    expect(source).toContain('<PlayIcon');
    expect(source).toContain("from '@/components/atoms/PlayIcon'");
    expect(source).not.toContain('translate-x-px');
  });
});
