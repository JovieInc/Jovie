import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import type { LyricsListLine } from './LyricsList';
import { LyricsList } from './LyricsList';

const lines: LyricsListLine[] = [
  { at: 0, text: 'Driving through the midnight glow' },
  { at: 12, text: "City lights, I don't wanna go" },
  { at: 24, text: 'Keep the radio loud and low' },
];

const meta = {
  title: 'Shell/LyricsList',
  component: LyricsList,
  parameters: {
    layout: 'centered',
  },
  decorators: [
    Story => (
      <div className='w-80 bg-base'>
        <Story />
      </div>
    ),
  ],
  args: {
    lines,
    onSeek: fn(),
  },
} satisfies Meta<typeof LyricsList>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithEdit: Story = {
  args: {
    onEdit: fn(),
  },
};

export const ReadOnly: Story = {
  args: {
    onSeek: undefined,
  },
};

export const Empty: Story = {
  args: {
    lines: [],
  },
};
