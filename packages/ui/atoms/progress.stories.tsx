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
          'Determinate progress for long uploads and imports. Track uses surface-1; fill uses accent.',
      },
    },
  },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <div className='w-72'>
      <ProgressBar value={42} label='Uploading 42%' />
    </div>
  ),
};

export const Complete: Story = {
  render: () => (
    <div className='w-72'>
      <ProgressBar value={100} label='Import complete' />
    </div>
  ),
};