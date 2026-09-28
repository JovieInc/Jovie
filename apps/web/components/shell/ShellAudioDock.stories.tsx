import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { useTheme } from 'next-themes';
import { useEffect } from 'react';
import { expect, waitFor } from 'storybook/test';
import {
  resetAudioChromeSnapshot,
  setAudioChromeSnapshot,
} from '@/components/organisms/audio-chrome-state';
import { AudioBar } from './AudioBar';
import { ShellAudioDock } from './ShellAudioDock';
import { SidebarNowPlaying } from './SidebarNowPlaying';

/**
 * ShellAudioDock — the shell-level audio dock below the rounded main panel
 * (JOV-6680). The dock's visibility is driven by `audio-chrome-state`'s
 * `fullPlayerVisible`, so stories publish snapshots directly.
 */

const DOCK_TRACK = {
  id: 'bahamas-lost-light',
  title: 'Lost in the Light',
  artist: 'Bahamas',
  hasLyrics: true,
  bpm: 118,
  musicalKey: '8A',
};

function PlayerRow({ isPlaying }: { readonly isPlaying: boolean }) {
  return (
    <div className='grid grid-cols-[minmax(0,14rem)_minmax(0,1fr)] items-center gap-3 px-4 py-1.5'>
      <SidebarNowPlaying
        track={{
          trackTitle: DOCK_TRACK.title,
          artistName: DOCK_TRACK.artist,
          artworkUrl: 'https://placehold.co/640x640/111827/E5E7EB?text=Artwork',
        }}
        isPlaying={isPlaying}
        onPlay={() => undefined}
        playOverlayVisible={false}
        className='max-w-56 border-0 bg-transparent px-1 py-1 shadow-none'
      />
      <AudioBar
        isPlaying={isPlaying}
        onPlay={() => undefined}
        onPrevious={() => undefined}
        onNext={() => undefined}
        currentTime={42}
        duration={213}
        waveformOn={false}
        onToggleWaveform={() => undefined}
        track={DOCK_TRACK}
        className='min-w-0 px-0 py-0'
      />
    </div>
  );
}

interface DockSceneProps {
  /** Chrome snapshot to publish — mirrors production audio-chrome-state. */
  readonly chromeState: 'hidden' | 'playing' | 'paused';
  readonly theme: 'light' | 'dark';
  readonly rightRail?: boolean;
}

function DockScene({ chromeState, theme, rightRail }: DockSceneProps) {
  const { setTheme } = useTheme();

  useEffect(() => {
    setTheme(theme);
  }, [setTheme, theme]);

  useEffect(() => {
    if (chromeState === 'hidden') {
      resetAudioChromeSnapshot();
    } else {
      setAudioChromeSnapshot({
        activeTrackId: DOCK_TRACK.id,
        compactPlayerVisible: false,
        fullPlayerVisible: true,
      });
    }
    return () => resetAudioChromeSnapshot();
  }, [chromeState]);

  const isPlaying = chromeState === 'playing';

  return (
    <div className='flex h-[420px] w-[720px] gap-2 bg-base p-2'>
      {/* Main column: rounded panel + dock below, matching AppShellFrame. */}
      <div className='flex min-w-0 flex-1 flex-col'>
        <div className='flex min-h-0 flex-1 flex-col overflow-hidden rounded-(--app-shell-radius) bg-(--app-shell-content-surface) shadow-(--app-shell-shadow)'>
          <div className='border-subtle border-b px-4 py-2 text-xs text-tertiary-token'>
            Header
          </div>
          <div className='flex-1 p-4 text-xs text-quaternary-token'>
            Main content — nothing here shifts horizontally or reflows when the
            dock opens; only the panel&rsquo;s height animates.
          </div>
        </div>
        <ShellAudioDock>
          <PlayerRow isPlaying={isPlaying} />
        </ShellAudioDock>
      </div>
      {rightRail ? (
        <aside
          aria-label='Context Panel'
          className='w-40 shrink-0 rounded-(--app-shell-radius) bg-(--app-shell-content-surface) p-3 text-xs text-tertiary-token shadow-(--app-shell-shadow)'
        >
          Right rail — spans the full column height above the dock (L3 over L1).
        </aside>
      ) : null}
    </div>
  );
}

const meta = {
  title: 'Shell/ShellAudioDock',
  component: DockScene,
  parameters: { layout: 'fullscreen' },
  args: {
    chromeState: 'hidden',
    theme: 'dark',
    rightRail: false,
  },
  argTypes: {
    chromeState: {
      control: 'radio',
      options: ['hidden', 'playing', 'paused'],
    },
    theme: { control: 'radio', options: ['light', 'dark'] },
  },
} satisfies Meta<typeof DockScene>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Hidden: Story = {};

export const Playing: Story = {
  args: { chromeState: 'playing' },
};

export const Paused: Story = {
  args: { chromeState: 'paused' },
};

/** Fires the idle → playing transition after mount so the cinematic reveal
 *  animates in view. */
export const Revealing: Story = {
  args: { chromeState: 'hidden' },
  play: async () => {
    setAudioChromeSnapshot({
      activeTrackId: DOCK_TRACK.id,
      compactPlayerVisible: false,
      fullPlayerVisible: true,
    });
    const dock = document.querySelector('[data-shell-audio-dock]');
    await waitFor(() => expect(dock).toHaveAttribute('data-state', 'open'));
  },
};

export const WithRightRail: Story = {
  args: { chromeState: 'playing', rightRail: true },
};

export const PlayingLight: Story = {
  args: { chromeState: 'playing', theme: 'light' },
};

export const WithRightRailLight: Story = {
  args: { chromeState: 'playing', rightRail: true, theme: 'light' },
};
