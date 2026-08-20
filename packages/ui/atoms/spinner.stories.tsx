import type { Meta, StoryObj } from '@storybook/react';

import { Spinner } from './spinner';

const meta = {
  title: 'UI/Atoms/Spinner',
  component: Spinner,
  parameters: {
    layout: 'centered',
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
      <div className='rounded-lg border border-subtle bg-surface-3 p-4'>
        <Story />
      </div>
    ),
  ],
};

export const SizeAndToneMatrix: Story = {
  render: () => (
    <div className='grid grid-cols-3 items-center gap-5'>
      {(['primary', 'muted', 'inverse'] as const).flatMap(tone =>
        (['sm', 'md', 'lg'] as const).map(size => (
          <div
            key={`${tone}-${size}`}
            className={
              tone === 'inverse'
                ? 'grid justify-items-center gap-2 rounded-lg bg-surface-3 p-3'
                : 'grid justify-items-center gap-2 p-3'
            }
          >
            <Spinner
              size={size}
              tone={tone}
              label={`${size} ${tone} loading`}
            />
            <span className='text-2xs text-tertiary-token'>
              {size} / {tone}
            </span>
          </div>
        ))
      )}
    </div>
  ),
};
