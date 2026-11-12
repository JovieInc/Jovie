import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import { AudioPlayButton } from './AudioPlayControl';

const meta = {
  title: 'Shell/AudioPlayButton',
  component: AudioPlayButton,
  parameters: {
    layout: 'centered',
    jovie: { uncoveredProps: ['disabled'] },
  },
  args: {
    isPlaying: false,
    onClick: fn(),
  },
} satisfies Meta<typeof AudioPlayButton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Play: Story = {};

export const Pause: Story = {
  args: { isPlaying: true },
};

export const Loading: Story = {
  args: { isLoading: true },
};

export const Persistent: Story = {
  args: { size: 'persistent' },
};

/** Only the required props: the label falls back to the playback state. */
export const PartialNoLabel: Story = {
  args: { isPlaying: false, label: undefined, size: 'bar' },
};

export const LongContentLabel: Story = {
  args: {
    label:
      'Play the preview of Midnight Drive (Extended Club Mix) by The Long Weekend Collective',
  },
};

export const Rtl: Story = {
  args: { isPlaying: true, label: 'إيقاف المعاينة مؤقتًا' },
  decorators: [
    Story => (
      <div dir='rtl' lang='ar'>
        <Story />
      </div>
    ),
  ],
};
