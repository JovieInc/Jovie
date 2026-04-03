import { Circle, CircleDashed, type LucideIcon, XCircle } from 'lucide-react';
import type {
  TaskAgentStatus,
  TaskAssigneeKind,
  TaskPriority,
  TaskStatus,
} from '@/lib/tasks/types';
import type { AccentPaletteName } from '@/lib/ui/accent-palette';

export interface TaskVisualStage {
  readonly label: string;
  readonly percent: 0 | 25 | 50 | 75 | 100;
  readonly accent: AccentPaletteName;
  readonly icon: LucideIcon;
  readonly isTerminal: boolean;
}

export interface TaskPriorityMeta {
  readonly label: string;
  readonly accent: AccentPaletteName;
}

export interface TaskAssigneeMeta {
  readonly label: string;
  readonly avatarName: string;
  readonly accent: AccentPaletteName;
}

export interface TaskStatusVisual {
  readonly label: string;
  readonly accent: AccentPaletteName;
  readonly icon: LucideIcon;
  readonly filled: boolean;
}

export interface TaskPriorityVisual {
  readonly label: string;
  readonly accent: AccentPaletteName;
}

const TASK_VISUAL_STAGE_META: Record<
  TaskStatus,
  (agentStatus: TaskAgentStatus) => TaskVisualStage
> = {
  backlog: () => ({
    label: 'Not Started',
    percent: 0,
    accent: 'gray',
    icon: CircleDashed,
    isTerminal: false,
  }),
  todo: () => ({
    label: 'Not Started',
    percent: 25,
    accent: 'blue',
    icon: CircleDashed,
    isTerminal: false,
  }),
  in_progress: agentStatus =>
    agentStatus === 'awaiting_review' || agentStatus === 'approved'
      ? {
          label: 'In Progress',
          percent: 75,
          accent: 'orange',
          icon: Circle,
          isTerminal: false,
        }
      : {
          label: 'In Progress',
          percent: 50,
          accent: 'blue',
          icon: Circle,
          isTerminal: false,
        },
  done: () => ({
    label: 'Done',
    percent: 100,
    accent: 'green',
    icon: Circle,
    isTerminal: true,
  }),
  cancelled: () => ({
    label: 'Cancelled',
    percent: 0,
    accent: 'gray',
    icon: XCircle,
    isTerminal: true,
  }),
};

const TASK_STATUS_VISUALS: Record<TaskStatus, TaskStatusVisual> = {
  backlog: {
    label: 'Backlog',
    accent: 'gray',
    icon: CircleDashed,
    filled: false,
  },
  todo: {
    label: 'Todo',
    accent: 'blue',
    icon: CircleDashed,
    filled: false,
  },
  in_progress: {
    label: 'In Progress',
    accent: 'blue',
    icon: Circle,
    filled: false,
  },
  done: {
    label: 'Done',
    accent: 'green',
    icon: Circle,
    filled: true,
  },
  cancelled: {
    label: 'Cancelled',
    accent: 'gray',
    icon: XCircle,
    filled: false,
  },
};

const TASK_PRIORITY_META: Record<TaskPriority, TaskPriorityVisual> = {
  urgent: { label: 'Urgent', accent: 'red' },
  high: { label: 'High', accent: 'orange' },
  medium: { label: 'Medium', accent: 'purple' },
  low: { label: 'Low', accent: 'teal' },
  none: { label: 'None', accent: 'gray' },
};

export function getTaskStageVisual(
  status: TaskStatus,
  agentStatus: TaskAgentStatus
): TaskVisualStage {
  return TASK_VISUAL_STAGE_META[status](agentStatus);
}

export function getTaskStatusVisual(status: TaskStatus): TaskStatusVisual {
  return TASK_STATUS_VISUALS[status];
}

export function getTaskPriorityVisual(
  priority: TaskPriority
): TaskPriorityVisual {
  return TASK_PRIORITY_META[priority];
}

export function getTaskAssigneeVisual(
  assigneeKind: TaskAssigneeKind,
  artistName?: string | null
): TaskAssigneeMeta {
  if (assigneeKind === 'jovie') {
    return {
      label: 'Jovie',
      avatarName: 'Jovie',
      accent: 'purple',
    };
  }

  return {
    label: 'You',
    avatarName: artistName?.trim() || 'You',
    accent: 'blue',
  };
}

// DEPRECATION: use getTaskStageVisual instead.
export const getTaskVisualStage = getTaskStageVisual;

export function getTaskPriorityMeta(
  priority: TaskPriority
): TaskPriorityMeta | null {
  const visual = getTaskPriorityVisual(priority);
  return priority === 'none'
    ? null
    : {
        label: visual.label,
        accent: visual.accent,
      };
}

// DEPRECATION: use getTaskAssigneeVisual instead.
export const getTaskAssigneeMeta = getTaskAssigneeVisual;
