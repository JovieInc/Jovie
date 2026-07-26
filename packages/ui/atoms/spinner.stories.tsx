import type { Meta, StoryObj } from '@storybook/react';

import { ProgressIndicator } from './spinner';

const meta = {
  title: 'UI/Atoms/ProgressIndicator',
  component: ProgressIndicator,
  parameters: {
    docs: {
      description: {
        component:
          'Compact indeterminate progress for the initiating control or a truly action-local status row. Reduced motion uses a static fallback.',
      },
    },
  },
} satisfies Meta<typeof ProgressIndicator>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Medium: Story = {
  args: { size: 'md', tone: 'primary' },
};

export const SmallMuted: Story = {
  args: { size: 'sm', tone: 'muted' },
};

export const LargeInverse: Story = {
  args: { size: 'lg', tone: 'inverse' },
  decorators: [
    Story => (
      <div className='rounded-md bg-neutral-900 p-4'>
        <Story />
      </div>
    ),
  ],
};
