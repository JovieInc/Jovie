import {
  AlertTriangle,
  CheckCircle,
  Circle,
  CircleDashed,
  Hash,
  type LucideIcon,
  SignalHigh,
  SignalLow,
  SignalMedium,
  Sparkles,
  User,
  X,
  XCircle,
} from 'lucide-react';
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
  readonly name: string;
  readonly accent: AccentPaletteName;
  readonly filterIcon: LucideIcon;
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
          accent: 'purple',
          icon: Circle,
          isTerminal: false,
        },
  done: () => ({
    label: 'Done',
    percent: 100,
    accent: 'green',
    icon: CheckCircle,
    isTerminal: true,
  }),
  cancelled: () => ({
    label: 'Cancelled',
    percent: 0,
    accent: 'gray',
    icon: X,
    isTerminal: true,
  }),
};

const TASK_PRIORITY_META: Record<TaskPriority, TaskPriorityMeta | null> = {
  urgent: { label: 'Urgent', accent: 'red' },
  high: { label: 'High', accent: 'orange' },
  medium: { label: 'Medium', accent: 'purple' },
  low: { label: 'Low', accent: 'teal' },
  none: null,
};

const TASK_STATUS_FILTER_ICONS: Record<TaskStatus, LucideIcon> = {
  backlog: CircleDashed,
  todo: CircleDashed,
  in_progress: Circle,
  done: CheckCircle,
  cancelled: XCircle,
};

const TASK_PRIORITY_FILTER_ICONS: Record<TaskPriority, LucideIcon> = {
  urgent: AlertTriangle,
  high: SignalHigh,
  medium: SignalMedium,
  low: SignalLow,
  none: Hash,
};

export function getTaskVisualStage(
  status: TaskStatus,
  agentStatus: TaskAgentStatus
): TaskVisualStage {
  return TASK_VISUAL_STAGE_META[status](agentStatus);
}

export function getTaskPriorityMeta(
  priority: TaskPriority
): TaskPriorityMeta | null {
  return TASK_PRIORITY_META[priority];
}

export function getTaskStatusFilterIcon(status: TaskStatus): LucideIcon {
  return TASK_STATUS_FILTER_ICONS[status];
}

export function getTaskPriorityFilterIcon(priority: TaskPriority): LucideIcon {
  return TASK_PRIORITY_FILTER_ICONS[priority];
}

export function getTaskAssigneeMeta(
  assigneeKind: TaskAssigneeKind,
  artistName?: string | null
): TaskAssigneeMeta {
  if (assigneeKind === 'jovie') {
    return {
      label: 'Jovie',
      name: 'Jovie',
      accent: 'pink',
      filterIcon: Sparkles,
    };
  }

  return {
    label: 'You',
    name: artistName ?? 'You',
    accent: 'blue',
    filterIcon: User,
  };
}
