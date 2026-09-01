import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import type { ReleaseTaskView } from '@/lib/release-tasks/types';
import { ReleaseTaskCompactRow } from './ReleaseTaskCompactRow';
import { ReleaseTaskRow } from './ReleaseTaskRow';

const sampleTask: ReleaseTaskView = {
  id: 'task_1',
  releaseId: 'release_1',
  creatorProfileId: 'profile_1',
  templateItemId: 'template_1',
  title: 'Pitch playlist editors',
  description: null,
  explainerText: 'Share the release with playlist editors before launch week.',
  learnMoreUrl: null,
  videoUrl: null,
  category: 'Marketing',
  status: 'todo',
  priority: 'high',
  position: 1,
  assigneeType: 'human',
  assigneeUserId: null,
  aiWorkflowId: null,
  dueDaysOffset: 3,
  dueDate: new Date('2026-06-01T00:00:00.000Z'),
  completedAt: null,
  metadata: null,
  createdAt: new Date('2026-05-01T00:00:00.000Z'),
  updatedAt: new Date('2026-05-01T00:00:00.000Z'),
};

const meta = {
  title: 'Dashboard/Release Tasks/ReleaseTaskRow',
  component: ReleaseTaskRow,
  parameters: {
    layout: 'centered',
  },
  decorators: [
    Story => (
      <div className='w-full min-w-96 max-w-2xl bg-surface-0 p-3 text-primary-token'>
        <Story />
      </div>
    ),
  ],
  args: {
    task: sampleTask,
    onToggle: fn(),
  },
} satisfies Meta<typeof ReleaseTaskRow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Full: Story = {};

export const Completed: Story = {
  args: {
    task: {
      ...sampleTask,
      status: 'done',
      completedAt: new Date('2026-05-20T00:00:00.000Z'),
    },
  },
};

export const Compact: Story = {
  render: args => (
    <ReleaseTaskCompactRow
      task={args.task}
      onNavigate={fn()}
      onToggle={args.onToggle}
    />
  ),
};
