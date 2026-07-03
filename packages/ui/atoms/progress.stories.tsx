import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { ProgressBar } from './progress';

const meta: Meta<typeof ProgressBar> = {
  title: 'shadcn/ProgressBar',
  component: ProgressBar,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'Canonical determinate progress bar for uploads/imports. Track is bg-surface-2, fill is bg-accent. Use only when a real percent is known — otherwise use Skeleton (page/list loads) or Spinner (in-flight actions). Never mix.',
      },
    },
  },
  tags: ['autodocs'],
  args: {
    value: 62,
  },
  decorators: [
    Story => (
      <div className='w-80'>
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const WithLabel: Story = {
  args: {
    label: 'Importing releases',
  },
};

export const PercentOnly: Story = {
  args: {
    value: 40,
  },
};

export const NoHeader: Story = {
  args: {
    value: 75,
    showValue: false,
    ariaLabel: 'Upload progress',
  },
};

export const Small: Story = {
  args: {
    value: 30,
    size: 'sm',
    label: 'Uploading track',
  },
};

export const Complete: Story = {
  args: {
    value: 100,
    label: 'Import complete',
  },
};
