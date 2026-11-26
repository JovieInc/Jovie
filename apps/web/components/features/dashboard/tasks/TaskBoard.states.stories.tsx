import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import type { TaskBoardResult, TaskStatus, TaskView } from '@/lib/tasks/types';
import { TaskBoard } from './TaskBoard';

const visibleStatuses: TaskStatus[] = ['backlog', 'todo', 'in_progress'];

const task: TaskView = {
  id: 'task-1',
  taskNumber: 12,
  creatorProfileId: 'profile-1',
  title: 'Upload final master to distributor',
  description: null,
  status: 'todo',
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
  category: 'distribution',
  scheduledFor: null,
  startedAt: null,
  completedAt: null,
  position: 0,
  sourceTemplateId: null,
  metadata: null,
  createdAt: new Date('2026-04-01T00:00:00.000Z'),
  updatedAt: new Date('2026-04-01T00:00:00.000Z'),
};

function boardOf(tasks: TaskView[]): TaskBoardResult {
  return {
    totalCount: tasks.length,
    columns: [
      {
        status: 'todo',
        tasks,
        totalCount: tasks.length,
        nextCursor: null,
      },
    ],
  };
}

const meta = {
  title: 'Features/Dashboard/Tasks/TaskBoard/States',
  component: TaskBoard,
  parameters: { layout: 'fullscreen' },
  args: {
    board: boardOf([task]),
    visibleStatuses,
    isLoading: false,
    selectedTaskId: null,
    onOpenTask: fn(),
    onCreateTask: fn(),
    onMoveTask: fn(),
    getTaskContextMenuItems: () => [],
  },
} satisfies Meta<typeof TaskBoard>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Loading: the board skeleton keeps the final column grid. */
export const Loading: Story = { args: { isLoading: true } };

/** Empty: no tasks in any column. */
export const Empty: Story = { args: { board: boardOf([]) } };

/** Error: the board failed to load, so columns render empty. */
export const ErrorBoardUnavailable: Story = { args: { board: undefined } };

/** Partial: a Jovie-owned task with a failed agent run. */
export const Partial: Story = {
  args: {
    board: boardOf([{ ...task, assigneeKind: 'jovie', agentStatus: 'failed' }]),
  },
};

/** Long content: a long title and release name that truncate. */
export const LongContent: Story = {
  args: {
    board: boardOf([
      {
        ...task,
        title:
          'Upload the final mastered stems, alternate mixes and artwork to every distributor on the list',
        releaseTitle:
          'The Extraordinarily Long Titled Deluxe Anniversary Edition',
      },
    ]),
  },
};

/** Offline: the board is read-only data, so it renders the last loaded tasks. */
export const Offline: Story = {};

/** Rtl: right-to-left layout. */
export const Rtl: Story = {
  decorators: [
    function RtlDecorator(Story) {
      return (
        <div dir='rtl'>
          <Story />
        </div>
      );
    },
  ],
  args: { board: boardOf([{ ...task, title: 'رفع النسخة النهائية' }]) },
};
