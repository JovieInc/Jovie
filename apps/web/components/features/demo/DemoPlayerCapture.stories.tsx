import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, userEvent, within } from 'storybook/test';
import { PersistentAudioBar } from '@/components/organisms/PersistentAudioBar';
import { DemoPlayerCapture } from './DemoPlayerCapture';
import { DemoReleasesExperience } from './DemoReleasesExperience';

const meta = {
  title: 'Features/Demo/DemoPlayerCapture',
  component: DemoPlayerCapture,
  parameters: {
    layout: 'fullscreen',
    nextjs: {
      appDirectory: true,
      navigation: {
        pathname: '/demo',
        query: { capturePlayer: '1', playerTimestamp: '1:18' },
      },
    },
  },
  // capturePlayer is forced via the prop: per-story search params never reach
  // useSearchParams in the vitest browser runner, so the URL opt-in left the
  // capture player unmounted and the Playing play function failed (shard 15).
  // The Storybook auth-shell fixture omits persistent chrome. Mount the real
  // player here so the capture state has its intended accessible controls.
  render: () => (
    <div className='flex min-h-svh flex-col'>
      <DemoReleasesExperience capturePlayer />
      <PersistentAudioBar />
    </div>
  ),
} satisfies Meta<typeof DemoPlayerCapture>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playing: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const desktop = globalThis.matchMedia('(min-width: 1024px)').matches;
    const player = within(
      desktop
        ? await canvas.findByTestId('audio-surface-expanded-shell')
        : await canvas.findByRole('region', { name: 'Audio Player' })
    );
    await expect(
      player.getByRole('button', {
        name: desktop ? 'Pause (space)' : 'Pause playback',
      })
    ).toBeVisible();
    if (desktop) {
      await userEvent.click(
        player.getByRole('button', { name: 'Show waveform' })
      );
      await expect(
        player.getByRole('button', { name: 'Hide waveform' })
      ).toBeVisible();
    }
    await expect(player.getByText('1:18', { exact: true })).toBeVisible();
  },
};
