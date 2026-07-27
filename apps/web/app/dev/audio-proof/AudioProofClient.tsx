'use client';

import { createAudioTimelineDocument } from '@jovie/audio-contracts';
import { useSearchParams } from 'next/navigation';
import { useMemo } from 'react';
import { useTrackAudioPlayer } from '@/components/organisms/release-sidebar/useTrackAudioPlayer';

const CONTROL_CLASS =
  'h-11 rounded-md border border-subtle bg-surface-1 px-4 text-app text-primary-token transition-colors duration-subtle ease-subtle hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring';

export function AudioProofClient({ audioSrc }: { readonly audioSrc: string }) {
  const searchParams = useSearchParams();
  const { playbackState, toggleTrack, seek, jumpToCue, stop } =
    useTrackAudioPlayer();
  const view =
    searchParams.get('view') === 'destination' ? 'destination' : 'source';
  const timeline = useMemo(
    () =>
      createAudioTimelineDocument({
        trackId: 'audio-proof-long-vbr',
        revision: 0,
        sampleRateHz: 48_000,
        durationSamples: 2_880_000,
        cues: [
          {
            id: 'cue_proof',
            kind: 'drop',
            label: 'Proof Cue',
            sampleOffset: 2_304_000,
          },
        ],
        beatGrid: null,
      }),
    []
  );

  return (
    <section className='flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-6'>
      <h1 className='text-app font-heading text-primary-token'>
        {view === 'source' ? 'Source View' : 'Destination View'}
      </h1>
      <div className='flex flex-wrap gap-2'>
        <button
          type='button'
          className={CONTROL_CLASS}
          onClick={() =>
            toggleTrack({
              id: 'audio-proof-long-vbr',
              title: 'Long VBR proof',
              sourceKind: 'chat-upload-preview',
              audioUrl: audioSrc,
              artistName: 'Jovie test corpus',
              timeline,
            })
          }
        >
          Load Real Audio
        </button>
        <button
          type='button'
          className={CONTROL_CLASS}
          onClick={() => seek(12.5)}
        >
          Scrub to 0:12
        </button>
        <button
          type='button'
          className={CONTROL_CLASS}
          onClick={() => jumpToCue('cue_proof')}
        >
          Jump to Proof Cue
        </button>
        <button
          type='button'
          className={CONTROL_CLASS}
          onClick={() => {
            const nextView = view === 'source' ? 'destination' : 'source';
            // Next's native-history integration updates useSearchParams without
            // retransmitting the real-media fixture through an RSC navigation.
            window.history.pushState(
              null,
              '',
              `/dev/audio-proof?view=${nextView}`
            );
          }}
        >
          Navigate Shell
        </button>
        <button type='button' className={CONTROL_CLASS} onClick={stop}>
          Stop Audio
        </button>
      </div>
      <output
        data-testid='audio-proof-state'
        data-active-track={playbackState.activeTrackId ?? ''}
        data-current-time={playbackState.currentTime.toFixed(3)}
        data-playback-status={playbackState.playbackStatus}
        data-view={view}
        className='text-xs tabular-nums text-tertiary-token'
      >
        {playbackState.playbackStatus} · {playbackState.currentTime.toFixed(3)}
      </output>
    </section>
  );
}
