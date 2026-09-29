import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { DemoPriorityIcon } from './DemoPriorityIcon';

const meta = {
  title: 'Features/Demo/DemoPriorityIcon',
  component: DemoPriorityIcon,
  parameters: {
    layout: 'centered',
  },
} satisfies Meta<typeof DemoPriorityIcon>;

export default meta;
type Story = StoryObj<typeof meta>;

export const AllPriorities: Story = {
  args: { priority: 'medium' },
  render: () => (
    <div className='flex gap-3'>
      {(['urgent', 'high', 'medium', 'low', 'none'] as const).map(priority => (
        <DemoPriorityIcon key={priority} priority={priority} />
      ))}
    </div>
  ),
};
