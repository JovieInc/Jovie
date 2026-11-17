import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { TaskStatusIcon } from './TaskStatusIcon';

/** Rendered states of the task status glyph. */
const meta = {
  title: 'Shell/TaskStatusIcon/States',
  component: TaskStatusIcon,
  parameters: { layout: 'centered' },
  args: { status: 'in_progress' },
} satisfies Meta<typeof TaskStatusIcon>;

export default meta;
type Story = StoryObj<typeof meta>;

/** RTL: the half-filled glyph keeps its drawing in a right-to-left row. */
export const RtlInProgress: Story = {
  args: { agentRunning: true },
  render: function RtlInProgressRender(args) {
    return (
      <div dir='rtl' className='flex items-center gap-2 text-xs'>
        <TaskStatusIcon {...args} />
        <span className='text-secondary-token'>مهمة قيد التنفيذ</span>
      </div>
    );
  },
};
