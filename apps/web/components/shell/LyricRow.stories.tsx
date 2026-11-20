import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { LyricRow } from './LyricRow';

const meta = {
  title: 'Shell/LyricRow',
  component: LyricRow,
  parameters: {
    layout: 'centered',
  },
} satisfies Meta<typeof LyricRow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  // LyricRow renders an <li> (listitem) and its display copy assumes the
  // dark shell surface — wrap in a real <ul> on the dark base so axe sees
  // valid list structure and the intended contrast context.
  render: args => (
    <ul className='w-full max-w-2xl list-none space-y-5 bg-base px-6 py-10'>
      <LyricRow {...args} />
    </ul>
  ),
  args: {
    line: { startSec: 12, text: 'Sunlight through the skyline glass' },
    index: 0,
    isActive: false,
    isFocused: false,
    editing: false,
    onFocus: () => {},
    onSeek: () => {},
    onStamp: () => {},
    onChangeText: () => {},
  },
};
