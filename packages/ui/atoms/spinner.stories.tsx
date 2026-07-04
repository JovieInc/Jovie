import type { Meta, StoryObj } from '@storybook/react';

import { Spinner } from './spinner';

const meta = {
  title: 'UI/Atoms/Spinner',
  component: Spinner,
  parameters: {
    docs: {
      description: {
        component:
          'Inline spinner for buttons and in-flight actions. See packages/ui/docs/loading-states.md.',
      },
    },
  },
} satisfies Meta<typeof Spinner>;

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
