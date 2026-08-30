import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { AudioWaveformEditor } from './AudioWaveformEditor';

const meta = {
  title: 'Features/Release/AudioWaveformEditor',
  component: AudioWaveformEditor,
  parameters: {
    layout: 'centered',
    jovie: {
      uncoveredProps: ['audioUrl', 'disabled'],
    },
  },
} satisfies Meta<typeof AudioWaveformEditor>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
