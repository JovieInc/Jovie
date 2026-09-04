import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { DictationWaveform } from './DictationWaveform';

const meta = {
  title: 'Shell/DictationWaveform',
  component: DictationWaveform,
  parameters: {
    layout: 'centered',
  },
} satisfies Meta<typeof DictationWaveform>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Listening: Story = {
  args: {
    active: true,
  },
};

export const Idle: Story = {
  args: {
    active: false,
  },
};

export const CompactBars: Story = {
  args: {
    active: true,
    bars: 12,
  },
};
