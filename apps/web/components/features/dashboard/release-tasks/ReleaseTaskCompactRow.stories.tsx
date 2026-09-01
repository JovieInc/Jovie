import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import type { ReleaseTaskView } from '@/lib/release-tasks/types';
import { ReleaseTaskCompactRow } from './ReleaseTaskCompactRow';

const task: ReleaseTaskView = {
  id: 'task_1',
  releaseId: 'release_1',
  creatorProfileId: 'profile_1',
  templateItemId: 'template_1',
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
  dueDate: new Date('2026-06-01T00:00:00.000Z'),
  completedAt: null,
  metadata: null,
  createdAt: new Date('2026-05-01T00:00:00.000Z'),
  updatedAt: new Date('2026-05-01T00:00:00.000Z'),
};

const meta = {
  title: 'Dashboard/Release Tasks/ReleaseTaskCompactRow',
  component: ReleaseTaskCompactRow,
  parameters: {
    layout: 'centered',
  },
  decorators: [
    Story => (
      <div className='w-96 bg-surface-0 p-3 text-primary-token'>
        <Story />
      </div>
    ),
  ],
  args: {
    task,
    onToggle: fn(),
    onNavigate: fn(),
  },
} satisfies Meta<typeof ReleaseTaskCompactRow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Compact: Story = {};

export const Automated: Story = {
  args: {
    task: {
      ...task,
      assigneeType: 'ai_workflow',
      aiWorkflowId: 'workflow_1',
    },
  },
};
