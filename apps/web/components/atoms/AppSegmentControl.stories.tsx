import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import { AppSegmentControl } from './AppSegmentControl';

const options = [
  { value: 'details', label: 'Details' },
  { value: 'activity', label: 'Activity' },
  { value: 'sources', label: 'Sources' },
] as const;

const meta = {
  title: 'Atoms/AppSegmentControl',
  component: AppSegmentControl,
  parameters: { layout: 'centered' },
  decorators: [
    Story => (
      <div className='w-80 bg-(--app-shell-content-surface) p-3'>
        <Story />
      </div>
    ),
  ],
  args: {
    value: 'details',
    onValueChange: fn(),
    options,
    'aria-label': 'Entity view',
  },
} satisfies Meta<typeof AppSegmentControl>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Muted: Story = {};

export const Ghost: Story = {
  args: { surface: 'ghost' },
};

export const DisabledOption: Story = {
  args: {
    options: [options[0], { ...options[1], disabled: true }, options[2]],
  },
};
