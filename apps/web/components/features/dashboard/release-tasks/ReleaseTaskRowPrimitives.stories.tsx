import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import type { ReleaseTaskView } from '@/lib/release-tasks/types';
import {
  ReleaseTaskCheckbox,
  ReleaseTaskTitleText,
} from './ReleaseTaskRowPrimitives';

const task: ReleaseTaskView = {
  id: 'task-story',
  releaseId: 'release-story',
  creatorProfileId: 'profile-story',
  templateItemId: 'template-story',
  title: 'Pitch playlist editors',
  description: null,
  explainerText: null,
  learnMoreUrl: null,
  videoUrl: null,
  category: 'Marketing',
  status: 'todo',
  priority: 'medium',
  position: 1,
  assigneeType: 'human',
  assigneeUserId: null,
  aiWorkflowId: null,
  dueDaysOffset: 3,
  dueDate: new Date('2026-09-01T00:00:00.000Z'),
  completedAt: null,
  metadata: null,
  createdAt: new Date('2026-08-01T00:00:00.000Z'),
  updatedAt: new Date('2026-08-01T00:00:00.000Z'),
};

const meta = {
  title: 'Features/Dashboard/Release Tasks/ReleaseTaskRowPrimitives',
  component: ReleaseTaskCheckbox,
  parameters: {
    layout: 'centered',
  },
  decorators: [
    (Story, context) => (
      <div className='flex items-center gap-3 rounded-md border border-subtle bg-surface-1 p-4'>
        <Story />
        <span className='text-app text-secondary-token'>
          {context.args.task?.title ?? task.title}
        </span>
      </div>
    ),
  ],
  args: {
    task,
    isDone: false,
    onToggle: fn(),
  },
} satisfies Meta<typeof ReleaseTaskCheckbox>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Todo: Story = {};

export const Done: Story = {
  args: {
    isDone: true,
    task: {
      ...task,
      status: 'done',
      completedAt: new Date('2026-09-02T00:00:00.000Z'),
    },
  },
};

export const Automated: Story = {
  args: {
    task: {
      ...task,
      assigneeType: 'ai_workflow',
    },
  },
};

/** A long title in the truncating title primitive beside the checkbox. */
export const LongContentTitle: Story = {
  args: {
    task: {
      ...task,
      title:
        'Pitch the deluxe edition to every editorial playlist curator who featured the lead single',
    },
  },
  render: args => (
    <div className='flex w-56 min-w-0 items-center gap-2'>
      <ReleaseTaskCheckbox {...args} />
      <ReleaseTaskTitleText className='min-w-0 flex-1' isDone={args.isDone}>
        {args.task.title}
      </ReleaseTaskTitleText>
    </div>
  ),
};

export const RtlTitle: Story = {
  args: {
    task: { ...task, title: 'التواصل مع محرري قوائم التشغيل' },
  },
  decorators: [
    Story => (
      <div dir='rtl' lang='ar'>
        <Story />
      </div>
    ),
  ],
};
