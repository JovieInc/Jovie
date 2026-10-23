import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, userEvent, within } from 'storybook/test';
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
  render: () => <DemoReleasesExperience />,
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
