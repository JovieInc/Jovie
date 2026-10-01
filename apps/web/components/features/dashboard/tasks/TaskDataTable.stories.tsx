import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { ColumnDef } from '@/lib/tanstack-table';
import type { TaskView } from '@/lib/tasks/types';
import {
  TASK_DATA_TABLE_MULTILINE_CELL_CONTENT_CLASSNAME,
  TaskDataTable,
} from './TaskDataTable';
import { TaskListRow } from './TaskListRow';

type TaskRow = { id: string; title: string; status: string };

const columns: ColumnDef<TaskRow, unknown>[] = [
  { accessorKey: 'title', header: 'Title' },
  { accessorKey: 'status', header: 'Status' },
];

const data: TaskRow[] = [
  { id: '1', title: 'Review provider mapping', status: 'Open' },
  { id: '2', title: 'Confirm release metadata', status: 'Done' },
];

const meta: Meta<typeof TaskDataTable<TaskRow>> = {
  title: 'Dashboard/Tasks/TaskDataTable',
  component: TaskDataTable,
  parameters: {
    layout: 'fullscreen',
  },
};

export default meta;
type Story = StoryObj<typeof TaskDataTable<TaskRow>>;

export const Default: Story = {
  args: {
    columns,
    data,
    getRowId: row => row.id,
  },
};

const taskRows: TaskView[] = [
  {
    id: 'task-row-short',
    taskNumber: 41,
    creatorProfileId: 'profile-story',
    title: 'Review release metadata',
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
    dueAt: new Date('2026-10-15T00:00:00.000Z'),
    releaseId: 'release-story',
    releaseTitle:
      'Final distributor release with campaign assets and delivery metadata',
    parentTaskId: null,
    category: 'distribution',
    scheduledFor: null,
    startedAt: null,
    completedAt: null,
    position: 0,
    sourceTemplateId: null,
    metadata: null,
    createdAt: new Date('2026-09-29T00:00:00.000Z'),
    updatedAt: new Date('2026-09-29T00:00:00.000Z'),
  },
  {
    id: 'task-row-long',
    taskNumber: 42,
    creatorProfileId: 'profile-story',
    title:
      'Prepare the final distributor handoff with approved artwork, licensing, and campaign metadata',
    description: null,
    status: 'in_progress',
    priority: 'urgent',
    assigneeKind: 'human',
    assigneeUserId: null,
    agentType: null,
    agentStatus: 'idle',
    agentInput: null,
    agentOutput: null,
    agentError: null,
    dueAt: new Date('2026-10-15T00:00:00.000Z'),
    releaseId: 'release-story',
    releaseTitle:
      'Final distributor release with campaign assets and delivery metadata',
    parentTaskId: null,
    category: 'distribution',
    scheduledFor: null,
    startedAt: null,
    completedAt: null,
    position: 1,
    sourceTemplateId: null,
    metadata: null,
    createdAt: new Date('2026-09-29T00:00:00.000Z'),
    updatedAt: new Date('2026-09-29T00:00:00.000Z'),
  },
];

const taskRowColumns: ColumnDef<TaskView, unknown>[] = [
  {
    accessorKey: 'taskNumber',
    id: 'title',
    header: 'Tasks',
    size: 9999,
    meta: {
      className: 'px-0',
      cellContentClassName: TASK_DATA_TABLE_MULTILINE_CELL_CONTENT_CLASSNAME,
    },
    cell: ({ row }) => (
      <TaskListRow
        task={row.original}
        onOpenRelease={() => {}}
        artistName='Tim White'
      />
    ),
  },
];

export const MultilineTaskRows: Story = {
  render: () => (
    <div className='w-full max-w-md' data-testid='task-row-geometry-frame'>
      <TaskDataTable
        columns={taskRowColumns}
        data={taskRows}
        getRowId={row => row.id}
      />
    </div>
  ),
};
