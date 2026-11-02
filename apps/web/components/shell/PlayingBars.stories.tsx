import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { PlayingBars } from './PlayingBars';

const meta = {
  title: 'Shell/PlayingBars',
  component: PlayingBars,
  parameters: {
    layout: 'centered',
  },
  // The indicator mounts inside a positioned parent (absolute inset-0),
  // so the story stages it on a quiet positioned tile like the shell does.
  decorators: [
    Story => (
      <div className='relative h-10 w-10 bg-base'>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof PlayingBars>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const CustomLabel: Story = {
  args: {
    label: 'Preview playing',
  },
};
