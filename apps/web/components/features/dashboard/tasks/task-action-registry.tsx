import type { ReactNode } from 'react';
import type { ContextMenuItemType } from '@/components/organisms/table';
import type {
  TaskAssigneeKind,
  TaskPriority,
  TaskStatus,
  TaskView,
} from '@/lib/tasks/types';

export const TASK_STATUS_OPTIONS = [
  ['backlog', 'Backlog'],
  ['todo', 'Todo'],
  ['in_progress', 'In Progress'],
  ['done', 'Done'],
  ['cancelled', 'Cancelled'],
] as const satisfies ReadonlyArray<readonly [TaskStatus, string]>;

export const TASK_PRIORITY_OPTIONS = [
  ['urgent', 'Urgent'],
  ['high', 'High'],
  ['medium', 'Medium'],
  ['low', 'Low'],
  ['none', 'None'],
] as const satisfies ReadonlyArray<readonly [TaskPriority, string]>;

export const TASK_ASSIGNEE_OPTIONS = [
  ['human', 'Me'],
  ['jovie', 'Jovie'],
] as const satisfies ReadonlyArray<readonly [TaskAssigneeKind, string]>;

/** The invoking surface controls only redundancy, never available capability. */
export type TaskActionSurface = 'context' | 'overflow' | 'detail';

interface TaskActionHandlers {
  readonly onOpenTask: (task: TaskView) => void;
  readonly onOpenRelease: (task: TaskView) => void;
  readonly onGeneratePitch: (task: TaskView) => void;
  readonly onRequestDelete: (task: TaskView) => void;
  readonly onUpdateStatus: (taskId: string, status: TaskStatus) => void;
  readonly onUpdatePriority: (taskId: string, priority: TaskPriority) => void;
  readonly onUpdateAssignee: (
    taskId: string,
    assigneeKind: TaskAssigneeKind
  ) => void;
}

interface TaskActionVisuals {
  readonly openTask: ReactNode;
  readonly openRelease: ReactNode;
  readonly generatePitch: ReactNode;
  readonly deleteTask: ReactNode;
  readonly status: (status: TaskStatus) => ReactNode;
  readonly priority: (priority: TaskPriority) => ReactNode;
  readonly assignee: (assigneeKind: TaskAssigneeKind) => ReactNode;
}

function withSeparator(
  items: ContextMenuItemType[],
  group: ContextMenuItemType[]
): ContextMenuItemType[] {
  if (items.length > 0 && group.length > 0) {
    items.push({ type: 'separator' });
  }
  items.push(...group);
  return items;
}

/**
 * Canonical Task action source for table context menus, overflow triggers, and
 * the task detail surface. Detail already exposes the three frequent property
 * controls inline, so its overflow intentionally omits those duplicates.
 */
export function buildTaskActionMenuItems({
  task,
  surface,
  canGeneratePitch,
  handlers,
  visuals,
}: Readonly<{
  task: TaskView;
  surface: TaskActionSurface;
  canGeneratePitch: boolean;
  handlers: TaskActionHandlers;
  visuals: TaskActionVisuals;
}>): ContextMenuItemType[] {
  const items: ContextMenuItemType[] = [];

  if (surface === 'context') {
    items.push({
      id: 'open-task',
      label: 'Open Task',
      icon: visuals.openTask,
      onClick: () => handlers.onOpenTask(task),
    });
  }

  if (surface !== 'detail') {
    withSeparator(items, [
      {
        id: 'change-status',
        label: 'Status',
        icon: visuals.status(task.status),
        items: TASK_STATUS_OPTIONS.map(([value, label]) => ({
          id: `status-${value}`,
          label,
          icon: visuals.status(value),
          onClick: () => handlers.onUpdateStatus(task.id, value),
          disabled: task.status === value,
        })),
      },
      {
        id: 'change-priority',
        label: 'Priority',
        icon: visuals.priority(task.priority),
        items: TASK_PRIORITY_OPTIONS.map(([value, label]) => ({
          id: `priority-${value}`,
          label,
          icon: visuals.priority(value),
          onClick: () => handlers.onUpdatePriority(task.id, value),
          disabled: task.priority === value,
        })),
      },
      {
        id: 'change-assignee',
        label: 'Assignee',
        icon: visuals.assignee(task.assigneeKind),
        items: TASK_ASSIGNEE_OPTIONS.map(([value, label]) => ({
          id: `assignee-${value}`,
          label,
          icon: visuals.assignee(value),
          onClick: () => handlers.onUpdateAssignee(task.id, value),
          disabled: task.assigneeKind === value,
        })),
      },
    ]);
  }

  const relatedItems: ContextMenuItemType[] = [];
  if (task.releaseId && surface !== 'detail') {
    relatedItems.push({
      id: 'open-release',
      label: 'Open Release',
      icon: visuals.openRelease,
      onClick: () => handlers.onOpenRelease(task),
    });
  }
  if (canGeneratePitch) {
    relatedItems.push({
      id: 'generate-pitch',
      label: 'Generate Pitch',
      icon: visuals.generatePitch,
      onClick: () => handlers.onGeneratePitch(task),
    });
  }
  withSeparator(items, relatedItems);

  withSeparator(items, [
    {
      id: 'delete-task',
      label: 'Delete Task',
      icon: visuals.deleteTask,
      destructive: true,
      onClick: () => handlers.onRequestDelete(task),
    },
  ]);

  return items;
}
