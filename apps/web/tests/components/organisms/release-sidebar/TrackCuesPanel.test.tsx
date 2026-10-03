import {
  type AudioTimelineDocumentV1,
  createAudioTimelineDocument,
} from '@jovie/audio-contracts';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TrackCuesPanel } from '@/components/organisms/release-sidebar/TrackCuesPanel';
import {
  loadTrackCueTimelineAction,
  saveTrackCueTimelineAction,
} from '@/components/organisms/release-sidebar/track-cues-action';

const RATE = 48_000;
const TRACK_ID = 'track-cues-1';

const { loadMock, saveMock } = vi.hoisted(() => ({
  loadMock: vi.fn(),
  saveMock: vi.fn(),
}));

vi.mock(
  '@/components/organisms/release-sidebar/track-cues-action',
  () => ({
    loadTrackCueTimelineAction: loadMock,
    saveTrackCueTimelineAction: saveMock,
  })
);

function persistedDoc(
  cues: readonly {
    id: string;
    kind: 'intro' | 'verse' | 'chorus' | 'custom';
    label: string;
    sampleOffset: number;
  }[] = []
): AudioTimelineDocumentV1 {
  return createAudioTimelineDocument({
    trackId: TRACK_ID,
    revision: 0,
    sampleRateHz: RATE,
    durationSamples: RATE * 60,
    cues,
    beatGrid: null,
  });
}

function Panel() {
  return <TrackCuesPanel trackId={TRACK_ID} durationMs={60_000} />;
}

describe('TrackCuesPanel', () => {
  beforeEach(() => {
    loadMock.mockReset().mockResolvedValue(null);
    saveMock.mockReset().mockResolvedValue({ ok: true });
  });

  it('loads and lists the persisted cue timeline', async () => {
    loadMock.mockResolvedValue(
      persistedDoc([
        { id: 'cue_a', kind: 'intro', label: 'Intro', sampleOffset: 0 },
        { id: 'cue_b', kind: 'chorus', label: 'Hook', sampleOffset: RATE * 30 },
      ])
    );
    render(<Panel />);
    expect(await screen.findByText('Intro')).toBeInTheDocument();
    expect(screen.getByText('Hook')).toBeInTheDocument();
    expect(loadMock).toHaveBeenCalledWith(TRACK_ID);
  });

  it('adds a cue at the playhead and persists it', async () => {
    const user = userEvent.setup();
    render(<Panel />);
    const add = await screen.findByRole('button', {
      name: 'Add cue at playhead',
    });
    await user.click(add);
    expect(await screen.findByText('Cue 1')).toBeInTheDocument();
    await waitFor(() => expect(saveMock).toHaveBeenCalledTimes(1));
    expect(saveMock.mock.calls[0]![0].timeline.cues).toHaveLength(1);
  });

  it('renames a cue via F2 + Enter and moves it with the arrow keys', async () => {
    loadMock.mockResolvedValue(
      persistedDoc([
        { id: 'cue_a', kind: 'verse', label: 'Verse', sampleOffset: RATE * 5 },
      ])
    );
    const user = userEvent.setup();
    render(<Panel />);
    const row = await screen.findByRole('button', { name: /Cue Verse/ });
    row.focus();
    await user.keyboard('{F2}');
    const input = await screen.findByLabelText('Cue label');
    await user.clear(input);
    await user.type(input, 'Pre-chorus{Enter}');
    expect(await screen.findByText('Pre-chorus')).toBeInTheDocument();

    const renamed = await screen.findByRole('button', {
      name: /Cue Pre-chorus/,
    });
    renamed.focus();
    await user.keyboard('{ArrowRight}');
    await waitFor(() =>
      expect(
        saveMock.mock.calls.at(-1)![0].timeline.cues[0].sampleOffset
      ).toBe(RATE * 6)
    );
  });

  it('deletes a cue with the Delete key', async () => {
    loadMock.mockResolvedValue(
      persistedDoc([
        { id: 'cue_a', kind: 'outro', label: 'Outro', sampleOffset: RATE * 50 },
      ])
    );
    const user = userEvent.setup();
    render(<Panel />);
    const row = await screen.findByRole('button', { name: /Cue Outro/ });
    row.focus();
    await user.keyboard('{Delete}');
    await waitFor(() =>
      expect(screen.queryByText('Outro')).not.toBeInTheDocument()
    );
  });

  it('undoes and redoes cue edits from the keyboard', async () => {
    loadMock.mockResolvedValue(
      persistedDoc([
        { id: 'cue_a', kind: 'intro', label: 'Intro', sampleOffset: 0 },
      ])
    );
    const user = userEvent.setup();
    render(<Panel />);
    const row = await screen.findByRole('button', { name: /Cue Intro/ });
    row.focus();
    await user.keyboard('{Delete}');
    await waitFor(() =>
      expect(screen.queryByText('Intro')).not.toBeInTheDocument()
    );

    await user.keyboard('{Control>}z{/Control}');
    expect(await screen.findByText('Intro')).toBeInTheDocument();

    await user.keyboard('{Control>}{Shift>}z{/Shift}{/Control}');
    await waitFor(() =>
      expect(screen.queryByText('Intro')).not.toBeInTheDocument()
    );
  });
});
