import { Circle, CircleDashed, type LucideIcon, XCircle } from 'lucide-react';
import type {
  TaskAgentStatus,
  TaskAssigneeKind,
  TaskPriority,
  TaskStatus,
} from '@/lib/tasks/types';
import type { AccentPaletteName } from '@/lib/ui/accent-palette';
import { capitalizeFirst } from '@/lib/utils/string-utils';

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
  readonly bars: number;
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
  urgent: { label: 'Urgent', accent: 'red', bars: 4 },
  high: { label: 'High', accent: 'orange', bars: 3 },
  medium: { label: 'Medium', accent: 'purple', bars: 2 },
  low: { label: 'Low', accent: 'teal', bars: 1 },
  none: { label: 'None', accent: 'gray', bars: 0 },
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

/**
 * Assignee chips always resolve from `assigneeKind` only.
 * Never bind release/song titles (or display names) into the chip label —
 * GH-12331: wrong field binding showed "Take Me Over" etc. as the assignee.
 * The optional `artistName` arg is retained for call-site compatibility and ignored.
 */
export function getTaskAssigneeVisual(
  assigneeKind: TaskAssigneeKind,
  _artistName?: string | null
): TaskAssigneeMeta {
  if (assigneeKind === 'jovie') {
    return {
      label: 'Jovie',
      avatarName: 'Jovie',
      accent: 'purple',
    };
  }

  return {
    label: 'Me',
    avatarName: 'Me',
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

/**
 * Agent statuses where Jovie is actively working the task. These drive
 * the inline "agent working" glyph on the row so a returning user can
 * see at a glance which queue items have a live thread. Terminal states
 * (idle/approved/failed) are excluded — the glyph signals *in-flight*
 * work, not history.
 */
const ACTIVE_AGENT_STATUSES = new Set<TaskAgentStatus>([
  'queued',
  'drafting',
  'awaiting_review',
]);

export function isTaskAgentWorking(
  assigneeKind: TaskAssigneeKind,
  status: TaskStatus,
  agentStatus: TaskAgentStatus
): boolean {
  return (
    assigneeKind === 'jovie' &&
    status === 'in_progress' &&
    ACTIVE_AGENT_STATUSES.has(agentStatus)
  );
}

/**
 * Presentational label for a task category (design / lyric / video /
 * distribution …). Categories are free-form strings on the task record;
 * this normalizes whitespace and Title-Cases the first word for display
 * per the UI casing rules. Returns null when the category is absent or
 * blank so callers can render nothing without a layout placeholder.
 */
export function getTaskCategoryLabel(
  category: string | null | undefined
): string | null {
  const trimmed = category?.trim();
  if (!trimmed) return null;
  return capitalizeFirst(trimmed);
}
