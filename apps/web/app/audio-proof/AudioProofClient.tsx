'use client';

import { createAudioTimelineDocument } from '@jovie/audio-contracts';
import { Button } from '@jovie/ui';
import { usePathname, useRouter } from 'next/navigation';
import { type ReactNode, useMemo } from 'react';
import { useTrackAudioPlayer } from '@/components/organisms/release-sidebar/useTrackAudioPlayer';

const CONTROL_CLASS =
  'h-11 rounded-md border border-subtle bg-surface-1 px-4 text-app text-primary-token transition-colors duration-subtle ease-subtle hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring';
const SCRUB_CONTROL_LABEL = 'Scrub 0:12';

export function AudioProofClient({
  audioSrc,
  children,
}: {
  readonly audioSrc: string;
  readonly children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { playbackState, toggleTrack, seek, jumpToCue } = useTrackAudioPlayer();
  const view = pathname.endsWith('/destination') ? 'destination' : 'source';
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
      {children}
      <div className='flex flex-wrap gap-2'>
        {playbackState.activeTrackId ? (
          <>
            <Button
              type='button'
              variant='secondary'
              size='lg'
              className={CONTROL_CLASS}
              onClick={() => seek(12.5)}
            >
              {SCRUB_CONTROL_LABEL}
            </Button>
            <Button
              type='button'
              variant='secondary'
              size='lg'
              className={CONTROL_CLASS}
              onClick={() => jumpToCue('cue_proof')}
            >
              Jump To Proof Cue
            </Button>
            <Button
              type='button'
              variant='secondary'
              size='lg'
              className={CONTROL_CLASS}
              onClick={() =>
                router.push(
                  `/audio-proof/${view === 'source' ? 'destination' : 'source'}`
                )
              }
            >
              Navigate Shell
            </Button>
          </>
        ) : (
          <Button
            type='button'
            variant='secondary'
            size='lg'
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
          </Button>
        )}
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
