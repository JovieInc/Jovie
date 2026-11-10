import type { Meta, StoryObj } from '@storybook/react';

import { ProgressBar } from './progress';

const meta = {
  title: 'UI/Atoms/ProgressBar',
  component: ProgressBar,
  parameters: {
    docs: {
      description: {
        component:
          'Upload/import progress with optional label slot. See packages/ui/docs/loading-states.md.',
      },
    },
  },
} satisfies Meta<typeof ProgressBar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Determinate: Story = {
  args: {
    value: 42,
    label: 'Importing releases',
    showValue: true,
  },
};

export const Indeterminate: Story = {
  args: {
    indeterminate: true,
    label: 'Finding music across platforms',
  },
};

export const RangeAndStates: Story = {
  render: () => (
    <div className='grid w-80 gap-5'>
      <ProgressBar value={25} label='Preparing upload' showValue />
      <ProgressBar
        value={100}
        min={50}
        max={150}
        label='Catalog import'
        showValue
      />
      <ProgressBar indeterminate label='Matching profiles' />
    </div>
  ),
};

export const Empty: Story = {
  args: {
    value: 0,
    label: 'Waiting to start import',
    showValue: true,
  },
  parameters: {
    docs: {
      description: {
        story:
          'A determinate bar at 0% shows an empty track with its label and value, so nothing jumps when progress begins.',
      },
    },
  },
};

export const Partial: Story = {
  render: () => (
    <div className='w-80'>
      <ProgressBar value={64} aria-label='Uploading cover artwork' />
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'Only a value and an accessible name: with no label or value text the header is omitted and just the track renders.',
      },
    },
  },
};

export const LongContent: Story = {
  render: () => (
    <div className='w-56'>
      <ProgressBar
        value={73}
        label='Importing the complete back catalog from every connected distributor'
        showValue
      />
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'A long label in a narrow container truncates to one line while the percentage stays visible.',
      },
    },
  },
};

export const Rtl: Story = {
  render: () => (
    <div dir='rtl' lang='ar' className='w-64'>
      <ProgressBar value={42} label='جارٍ استيراد الإصدارات' showValue />
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'In a right-to-left container the label sits at the start edge, the value at the end, and the fill grows from the right.',
      },
    },
  },
};
