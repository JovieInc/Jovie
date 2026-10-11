import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { DemoStatusIcon } from './DemoStatusIcon';

const meta = {
  title: 'Features/Demo/DemoStatusIcon',
  component: DemoStatusIcon,
  parameters: {
    layout: 'centered',
  },
} satisfies Meta<typeof DemoStatusIcon>;

export default meta;
type Story = StoryObj<typeof meta>;

export const AllStatuses: Story = {
  args: { status: 'live' },
  render: () => (
    <div className='flex gap-3'>
      {(['live', 'syncing', 'scheduled', 'draft', 'archived'] as const).map(
        status => (
          <DemoStatusIcon key={status} status={status} />
        )
      )}
    </div>
  ),
};
