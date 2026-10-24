import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ReleaseScheduleFields } from './ReleaseScheduleFields';

const meta = {
  title: 'Features/Release/ReleaseScheduleFields',
  component: ReleaseScheduleFields,
  parameters: {
    layout: 'centered',
  },
  decorators: [
    Story => (
      <div className='w-full max-w-sm rounded-2xl border border-subtle bg-surface-1 p-6'>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ReleaseScheduleFields>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Scheduled: Story = {};
