import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import type { ReleaseTaskView } from '@/lib/release-tasks/types';
import { ReleaseTaskCompactRow } from './ReleaseTaskCompactRow';

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
  dueDate: new Date('2026-09-10T00:00:00.000Z'),
  completedAt: null,
  metadata: null,
  createdAt: new Date('2026-09-01T00:00:00.000Z'),
  updatedAt: new Date('2026-09-01T00:00:00.000Z'),
};

const meta = {
  title: 'Features/Dashboard/Release Tasks/ReleaseTaskCompactRow',
  component: ReleaseTaskCompactRow,
  parameters: { layout: 'centered' },
  decorators: [
    Story => (
      <div className='w-80 rounded-lg border border-subtle bg-surface-1 p-2'>
        <Story />
      </div>
    ),
  ],
  args: {
    task,
    onNavigate: fn(),
    onToggle: fn(),
  },
} satisfies Meta<typeof ReleaseTaskCompactRow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Todo: Story = {};

export const Automated: Story = {
  args: {
    task: { ...task, assigneeType: 'ai_workflow' },
  },
};
