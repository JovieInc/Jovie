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
  // The shell that owns the PersistentAudioBar is aliased away in Storybook
  // (.storybook aliases @/components/organisms/AuthShellWrapper to the
  // lightweight layout mock), so the dock must be mounted here directly —
  // same production singleton store the capture component seeds (mirror of
  // Organisms/PersistentAudioBar's Continuity scene).
  render: () => (
    <div className='flex min-h-svh flex-col bg-base text-primary-token'>
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
    const player = within(
      await canvas.findByTestId('audio-surface-expanded-shell')
    );
    await expect(
      player.getByRole('button', { name: 'Pause (space)' })
    ).toBeVisible();
    await userEvent.click(
      player.getByRole('button', { name: 'Show waveform' })
    );
    await expect(player.getByText('1:18', { exact: true })).toBeVisible();
  },
};
