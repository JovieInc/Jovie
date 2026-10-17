import { Button } from '@jovie/ui';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { PersistentAudioBar } from './PersistentAudioBar';
import { useTrackAudioPlayer } from './release-sidebar/useTrackAudioPlayer';
import { SidebarBottomNowPlayingBridge } from './SidebarBottomNowPlayingBridge';

const meta = {
  title: 'Organisms/PersistentAudioBar',
  component: PersistentAudioBar,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof PersistentAudioBar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Idle: Story = {};

// Uses the production singleton and the checked-in one-second real WAV.
// Navigation remains Storybook's router stub; route proof is kept separate.
function ContinuityScene() {
  const { playbackState, toggleTrack, seek } = useTrackAudioPlayer();
  const startTrack = (index: number) => {
    void toggleTrack({
      id: `continuity-${index}`,
      title:
        index === 0
          ? 'Midnight Drive'
          : 'A very long track title that must remain readable without moving transport controls',
      artistName:
        index === 0 ? 'Maya Vale' : 'An artist with an exceptionally long name',
      audioUrl: new URL('../../tests/fixtures/audio/tone.wav', import.meta.url)
        .href,
      artworkUrl:
        index === 2
          ? null
          : index === 3
            ? '/player-art-broken.svg'
            : index === 0
              ? '/player-art-light.svg'
              : '/player-art-dark.svg',
      hasLyrics: true,
    });
  };
  return (
    <div className='flex min-h-screen bg-base text-primary-token'>
      <aside className='hidden w-56 shrink-0 flex-col justify-end lg:flex'>
        <SidebarBottomNowPlayingBridge />
      </aside>
      <div className='flex min-w-0 flex-1 flex-col'>
        <main className='flex-1 p-4'>
          <div className='flex flex-wrap gap-2'>
            <Button onClick={() => startTrack(0)}>First track</Button>
            <Button onClick={() => startTrack(1)}>Second track</Button>
            <Button onClick={() => seek(0.5)}>Seek midpoint</Button>
            <Button onClick={() => startTrack(2)}>No artwork</Button>
            <Button onClick={() => startTrack(3)}>Broken artwork</Button>
          </div>
          <output data-testid='continuity-state'>
            {JSON.stringify(playbackState)}
          </output>
        </main>
        <PersistentAudioBar />
      </div>
    </div>
  );
}

export const Continuity: Story = {
  render: () => <ContinuityScene />,
};
