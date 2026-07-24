'use client';

/**
 * Demo product surfaces — REAL UI only.
 *
 * Tim lock: demo may simplify data/state, but must never invent chrome,
 * alternate design systems, or hand-rolled stand-ins for product components.
 */
import { Button } from '@jovie/ui';
import { MessageSquare } from 'lucide-react';
import { ChatInput } from '@/components/jovie/components/ChatInput';
import { AppShellContentPanel } from '@/components/organisms/AppShellContentPanel';
import { AudioBar } from '@/components/shell/AudioBar';
import { LyricsView } from '@/components/shell/LyricsView';
import type { LyricLine } from '@/components/shell/LyricsView.types';
import { ReleasesEmptyState } from '@/features/dashboard/organisms/release-provider-matrix/ReleasesEmptyState';
import { DemoAuthShell } from './DemoAuthShell';
import { DemoClientProviders } from './DemoClientProviders';

const DEMO_LYRIC_LINES: readonly LyricLine[] = [
  { startSec: 0, text: 'Walking through the afterglow' },
  { startSec: 8, text: 'Every city feels like home' },
  { startSec: 16, text: 'Hold the light a little longer' },
  { startSec: 24, text: 'Sing it back until we own it' },
  { startSec: 32, text: 'Lost in the light with you' },
];

function DemoProductPanel({
  testId,
  children,
}: Readonly<{
  testId: string;
  children: React.ReactNode;
}>) {
  return (
    <DemoAuthShell>
      <AppShellContentPanel
        maxWidth='wide'
        frame='none'
        contentPadding='none'
        scroll='page'
        data-testid={testId}
      >
        <section className='min-h-[70vh] overflow-hidden bg-base px-4 py-4 text-primary-token sm:px-5 sm:py-5'>
          {children}
        </section>
      </AppShellContentPanel>
    </DemoAuthShell>
  );
}

/** Production chat composer with fixture-only state. */
export function DemoMusicAiCommandSurface() {
  return (
    <DemoProductPanel testId='demo-showcase-music-ai-command'>
      <DemoClientProviders>
        <div className='mx-auto flex w-full max-w-3xl flex-col gap-4'>
          <div className='flex items-center gap-2 text-sm text-secondary-token'>
            <MessageSquare className='size-4' aria-hidden />
            <span>Chat</span>
          </div>
          <div className='rounded-2xl border border-subtle bg-surface-1 p-3 shadow-card'>
            <ChatInput
              value=''
              onChange={() => undefined}
              onSubmit={() => undefined}
              isLoading={false}
              isSubmitting={false}
              placeholder='Ask Jovie about your release…'
            />
          </div>
          <p className='text-xs text-tertiary-token'>
            Demo mounts the production chat composer with fixture-only state.
          </p>
        </div>
      </DemoClientProviders>
    </DemoProductPanel>
  );
}

/** Production LyricsView with fixture timing data. */
export function DemoLyricsSurface() {
  return (
    <DemoProductPanel testId='demo-showcase-shell-lyrics'>
      <div className='mx-auto h-[min(70vh,36rem)] w-full max-w-3xl overflow-hidden rounded-2xl border border-subtle bg-surface-1'>
        <LyricsView
          track={{ title: 'Lost in the Light', artist: 'Sora Vale' }}
          durationSec={214}
          currentTimeSec={82}
          lines={DEMO_LYRIC_LINES}
          onSeek={() => undefined}
          timed
        />
      </div>
    </DemoProductPanel>
  );
}

/**
 * Library empty is still product UI (ReleasesEmptyState / connect path).
 * Full LibrarySurface needs live audio/player providers; empty product state is honest.
 */
export function DemoLibrarySurface() {
  return (
    <DemoProductPanel testId='demo-showcase-shell-library'>
      <div className='mx-auto w-full max-w-3xl'>
        <ReleasesEmptyState onConnectSpotify={() => undefined} />
      </div>
    </DemoProductPanel>
  );
}

/** Production AudioBar + System B actions — no invented track-table chrome. */
export function DemoTrackSurface() {
  return (
    <DemoProductPanel testId='demo-showcase-shell-track'>
      <div className='mx-auto flex w-full max-w-3xl flex-col gap-4'>
        <div className='rounded-2xl border border-subtle bg-surface-1 p-4 shadow-card'>
          <p className='text-sm font-medium text-primary-token'>
            Midnight Static
          </p>
          <p className='mt-1 text-xs text-secondary-token'>
            Sora Vale · Track workspace
          </p>
          <div className='mt-4 flex flex-wrap gap-2'>
            <Button type='button' variant='secondary' size='sm'>
              Open release
            </Button>
            <Button type='button' variant='primary' size='sm'>
              Edit lyrics
            </Button>
          </div>
        </div>
        <div className='overflow-hidden rounded-2xl border border-subtle bg-surface-1 shadow-card'>
          <AudioBar
            isPlaying={false}
            onPlay={() => undefined}
            onSeek={() => undefined}
            currentTime={42}
            duration={214}
            track={{
              id: 'demo-midnight-static',
              title: 'Midnight Static',
              artist: 'Sora Vale',
              hasLyrics: true,
            }}
          />
        </div>
      </div>
    </DemoProductPanel>
  );
}
