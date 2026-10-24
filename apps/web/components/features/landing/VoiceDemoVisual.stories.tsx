import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, userEvent, within } from 'storybook/test';
import { VoiceDemoVisual } from './VoiceDemoVisual';

const PLAY_LABEL = 'Play 4s sample (your voice)';
const PLAYING_LABEL = 'Playing sample…';

const meta = {
  title: 'Marketing/Landing/VoiceDemoVisual',
  component: VoiceDemoVisual,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'Voice landing demo card. The play button exposes its visible label as its accessible name in every state.',
      },
    },
  },
  args: {
    className: 'max-w-md',
  },
} satisfies Meta<typeof VoiceDemoVisual>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Idle: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole('button', { name: PLAY_LABEL })
    ).toBeInTheDocument();
  },
};

export const Playing: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const button = canvas.getByRole('button', { name: PLAY_LABEL });
    await userEvent.click(button);
    await expect(button).toHaveAccessibleName(PLAYING_LABEL);
    await expect(canvas.getByTestId('voice-demo-transcript')).toBeVisible();
  },
};
