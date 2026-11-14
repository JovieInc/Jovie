import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import { useEffect } from 'react';
import { expect, within } from 'storybook/test';
import {
  type AudioTrackSource,
  captureTrackPlayback,
} from './release-sidebar/useTrackAudioPlayer';
import { SidebarBottomNowPlayingBridge } from './SidebarBottomNowPlayingBridge';

/**
 * State coverage for the sidebar mini player. The bridge reads the shared
 * track player, so each story freezes one playback frame with the same
 * captureTrackPlayback hook the demo capture harness uses (no audio, no
 * network) and releases it on unmount.
 */
function withCapturedTrack(track: AudioTrackSource): Decorator {
  function CapturedTrack({ children }: { readonly children: React.ReactNode }) {
    useEffect(() => captureTrackPlayback(track, 214, 48), []);
    return <>{children}</>;
  }
  function WithCapturedTrack(Story: Parameters<Decorator>[0]) {
    return (
      <CapturedTrack>
        <Story />
      </CapturedTrack>
    );
  }
  return WithCapturedTrack;
}

const meta = {
  title: 'Organisms/SidebarBottomNowPlayingBridge States',
  component: SidebarBottomNowPlayingBridge,
  parameters: { layout: 'centered' },
  decorators: [
    StoryComponent => (
      <div className='w-57 bg-base p-2'>
        <StoryComponent />
      </div>
    ),
  ],
} satisfies Meta<typeof SidebarBottomNowPlayingBridge>;

export default meta;
type Story = StoryObj<typeof meta>;

const LONG_TITLE =
  'Lost in the Light (Extended Sunrise Reprise) [feat. The Midnight Frequency Orchestra]';

/** Long content: a long track title and artist truncate inside the mini card. */
export const LongContentTrackTitle: Story = {
  decorators: [
    withCapturedTrack({
      id: 'states-long-track',
      title: LONG_TITLE,
      artistName:
        'Bahamas, Jordan Lee, Taylor Montgomery and the Late Night Collective',
    }),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText(LONG_TITLE)).toBeInTheDocument();
  },
};

/** Right-to-left: an Arabic track inside an RTL sidebar. */
export const RtlArabicTrack: Story = {
  decorators: [
    withCapturedTrack({
      id: 'states-rtl-track',
      title: 'ضائع في الضوء',
      artistName: 'ليلى حداد',
    }),
    StoryComponent => (
      <div dir='rtl'>
        <StoryComponent />
      </div>
    ),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText('ضائع في الضوء')).toBeInTheDocument();
  },
};
