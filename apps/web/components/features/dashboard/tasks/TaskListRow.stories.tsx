import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { TaskView } from '@/lib/tasks/types';
import { TaskListRow } from './TaskListRow';

const baseTask: TaskView = {
  id: 'task-story-1',
  taskNumber: 12,
  creatorProfileId: 'profile-1',
  title: 'Upload final master to distributor',
  description: null,
  status: 'in_progress',
  priority: 'high',
  assigneeKind: 'human',
  assigneeUserId: null,
  agentType: null,
  agentStatus: 'processing',
  agentInput: null,
  agentOutput: null,
  agentError: null,
  dueAt: null,
  releaseId: 'release-1',
  releaseTitle: 'QA Release',
  parentTaskId: null,
  category: 'distribution',
  scheduledFor: null,
  startedAt: null,
  completedAt: null,
  position: 0,
  sourceTemplateId: null,
  metadata: null,
  createdAt: '2026-04-01T00:00:00.000Z',
  updatedAt: '2026-04-01T00:00:00.000Z',
};

const meta = {
  title: 'Features/Dashboard/Tasks/TaskListRow',
  component: TaskListRow,
  parameters: {
    layout: 'padded',
    jovie: {
      uncoveredProps: ['onOpenRelease', 'actionSlot'],
    },
  },
  args: {
    task: baseTask,
    artistName: 'Tim White',
    onOpenRelease: () => {},
  },
} satisfies Meta<typeof TaskListRow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Selected: Story = {
  args: {
    isSelected: true,
  },
};

export const AgentWorking: Story = {
  args: {
    task: {
      ...baseTask,
      id: 'task-story-2',
      assigneeKind: 'jovie',
      status: 'in_progress',
      agentStatus: 'drafting',
    },
  },
};

export const Done: Story = {
  args: {
    task: {
      ...baseTask,
      id: 'task-story-3',
      status: 'done',
    },
  },
};
