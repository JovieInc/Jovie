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

export const Loading: Story = {
  render: () => (
    <div className='flex items-center gap-2 text-sm text-secondary-token'>
      <Spinner size='sm' tone='muted' label='Saving changes' />
      <span aria-hidden='true'>Saving changes…</span>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'The in-flight state: an animated ring announced politely as “Saving changes” beside its visible caption.',
      },
    },
  },
};

export const LongContent: Story = {
  render: () => (
    <div className='flex w-56 items-center gap-2 text-sm text-secondary-token'>
      <Spinner
        size='sm'
        label='Importing the complete back catalog from every distributor'
      />
      <span aria-hidden='true' className='min-w-0'>
        Importing the complete back catalog from every distributor…
      </span>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'Beside a long wrapping caption in a narrow row the spinner keeps its fixed square size instead of being squeezed.',
      },
    },
  },
};

export const Rtl: Story = {
  render: () => (
    <div
      dir='rtl'
      lang='ar'
      className='flex items-center gap-2 text-sm text-secondary-token'
    >
      <Spinner size='sm' label='جارٍ الحفظ' />
      <span aria-hidden='true'>جارٍ الحفظ…</span>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'In a right-to-left row the spinner leads from the start (right) edge and announces its Arabic label.',
      },
    },
  },
};
