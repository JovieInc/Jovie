import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { TaskView } from '@/lib/tasks/types';
import { TaskListRow } from './TaskListRow';

const baseTask: TaskView = {
  id: 'task-state-1',
  taskNumber: 12,
  creatorProfileId: 'profile-1',
  title: 'Upload final master to distributor',
  description: null,
  status: 'in_progress',
  priority: 'high',
  assigneeKind: 'human',
  assigneeUserId: null,
  agentType: null,
  agentStatus: 'idle',
  agentInput: null,
  agentOutput: null,
  agentError: null,
  dueAt: null,
  releaseId: 'release-1',
  releaseTitle: 'QA Release',
  parentTaskId: null,
  category: null,
  scheduledFor: null,
  startedAt: null,
  completedAt: null,
  position: 0,
  sourceTemplateId: null,
  metadata: null,
  createdAt: new Date('2026-04-01T00:00:00.000Z'),
  updatedAt: new Date('2026-04-01T00:00:00.000Z'),
};

const meta = {
  title: 'Features/Dashboard/Tasks/TaskListRow/States',
  component: TaskListRow,
  parameters: {
    layout: 'padded',
    jovie: { uncoveredProps: ['onOpenRelease', 'actionSlot'] },
  },
  args: {
    task: baseTask,
    artistName: 'Tim White',
    onOpenRelease: () => undefined,
  },
} satisfies Meta<typeof TaskListRow>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: a task with no release, due date or category attached. */
export const EmptyNoRelease: Story = {
  args: { task: { ...baseTask, releaseId: null, releaseTitle: null } },
};

/** Partial: the title and due state hidden because a detail pane shows them. */
export const PartialHiddenTitleAndDue: Story = {
  args: { hideTitle: true, hideDue: true, showAssignee: false },
};

/** Long content: a title and release name far wider than the row. */
export const LongContentTitle: Story = {
  args: {
    task: {
      ...baseTask,
      title:
        'Upload the final master, the instrumental, the stems and the artwork to every distributor before the pitch deadline',
      releaseTitle:
        'A Release Whose Title Is Much Too Long To Fit Beside The Task Metadata',
    },
  },
};

/** Rtl: an Arabic title inside a right-to-left container. */
export const RtlTitle: Story = {
  args: { task: { ...baseTask, title: 'رفع النسخة النهائية إلى الموزع' } },
  decorators: [
    function RtlFrame(Story) {
      return (
        <div dir='rtl'>
          <Story />
        </div>
      );
    },
  ],
};
