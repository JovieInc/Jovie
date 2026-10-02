/**
 * Deterministic, source-backed fixture for the tasks screen-certification
 * producer. It lets `TasksRoute` / `getTasks()` / `getTask()` — the
 * registered sources for `web.tasks` — render without a database, so the
 * Product Screenshots workflow can capture exact-head proof against a
 * production build with `DATABASE_URL=postgresql://localhost/noop`.
 *
 * Admission is gated by `isScreenCertAppShellFixtureProfile()`
 * (apps/web/lib/screen-cert/app-shell-fixture-gate.ts) — the exact reserved
 * profile id plus `isRenderFixtureEnabled()`, which fails closed on a real
 * production deployment.
 *
 * Never import this module from a non-fixture code path, and never widen
 * the admission check beyond the exact reserved profile id.
 */
import {
  SCREEN_CERT_APP_SHELL_PROFILE_ID,
  SCREEN_CERT_APP_SHELL_USER_ID,
} from '@/lib/screen-cert/app-shell-fixture-gate';
import type { TaskListResult, TaskView } from '@/lib/tasks/types';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/**
 * The row this producer selects and captures with the detail pane open —
 * see `SCREEN_CERT_TASKS_SELECTED_ID` below.
 */
export const SCREEN_CERT_TASKS_SELECTED_ID = 'screen-cert-task-1';
export const SCREEN_CERT_TASKS_SELECTED_TITLE =
  "Approve single artwork for 'Neon Skyline'";

/**
 * Built fresh on every call, not once at module load: the UI renders
 * relative labels ("DUE 2D", "3W AGO"), so a base time fixed at import
 * would drift into a wrong-looking state (e.g. a "2 days from now" due
 * date silently becoming "overdue") the longer the server runs.
 */
function buildScreenCertTasksFixtureTasks(): TaskView[] {
  const base = Date.now();
  const at = (offsetMs: number) => new Date(base + offsetMs);

  function baseTask(
    overrides: Partial<TaskView> &
      Pick<TaskView, 'id' | 'taskNumber' | 'title' | 'status' | 'priority'>
  ): TaskView {
    return {
      creatorProfileId: SCREEN_CERT_APP_SHELL_PROFILE_ID,
      description: null,
      assigneeKind: 'human',
      assigneeUserId: SCREEN_CERT_APP_SHELL_USER_ID,
      agentType: null,
      agentStatus: 'idle',
      agentInput: null,
      agentOutput: null,
      agentError: null,
      releaseId: null,
      releaseTitle: null,
      parentTaskId: null,
      category: null,
      dueAt: null,
      scheduledFor: null,
      startedAt: null,
      completedAt: null,
      position: overrides.taskNumber * 1024,
      sourceTemplateId: null,
      metadata: null,
      // mapTaskRow (task-actions.ts) defaults every real row to `?? 1`, so
      // match that floor rather than leaving this optional field unset.
      mutationVersion: 1,
      createdAt: at(-overrides.taskNumber * DAY),
      updatedAt: at(-overrides.taskNumber * HOUR),
      ...overrides,
    };
  }

  return [
    baseTask({
      id: SCREEN_CERT_TASKS_SELECTED_ID,
      taskNumber: 101,
      title: SCREEN_CERT_TASKS_SELECTED_TITLE,
      description:
        'Final crop from the photo shoot is ready — confirm before it goes to distributors.',
      status: 'in_progress',
      priority: 'high',
      category: 'release',
      dueAt: at(2 * DAY),
    }),
    baseTask({
      id: 'screen-cert-task-2',
      taskNumber: 102,
      title: 'Draft press release for album announcement',
      description: 'Cover the release date, lead single, and tour teaser.',
      status: 'todo',
      priority: 'urgent',
      assigneeKind: 'jovie',
      assigneeUserId: null,
      agentType: 'copywriter',
      agentStatus: 'drafting',
      category: 'press',
      dueAt: at(1 * DAY),
    }),
    baseTask({
      id: 'screen-cert-task-3',
      taskNumber: 103,
      title: 'Schedule Spotify pre-save campaign',
      status: 'todo',
      priority: 'medium',
      category: 'release',
      dueAt: at(5 * DAY),
    }),
    baseTask({
      id: 'screen-cert-task-4',
      taskNumber: 104,
      title: 'Review AI-drafted artist bio',
      description: 'Check tone and factual accuracy before publishing.',
      status: 'in_progress',
      priority: 'low',
      assigneeKind: 'jovie',
      assigneeUserId: null,
      agentType: 'copywriter',
      agentStatus: 'awaiting_review',
      category: 'profile',
    }),
    baseTask({
      id: 'screen-cert-task-5',
      taskNumber: 105,
      title: 'Confirm venue for release show',
      status: 'backlog',
      priority: 'medium',
      category: 'touring',
    }),
    baseTask({
      id: 'screen-cert-task-6',
      taskNumber: 106,
      title: 'Upload mastered audio files to distributor',
      status: 'done',
      priority: 'high',
      category: 'release',
      startedAt: at(-3 * DAY),
      completedAt: at(-1 * DAY),
    }),
    baseTask({
      id: 'screen-cert-task-7',
      taskNumber: 107,
      title: 'Send updated press kit to Pitchfork',
      status: 'cancelled',
      priority: 'none',
      assigneeKind: 'jovie',
      assigneeUserId: null,
      agentType: 'outreach',
      agentStatus: 'failed',
      agentError: 'Contact bounced — no longer accepting submissions.',
      category: 'press',
    }),
    baseTask({
      id: 'screen-cert-task-8',
      taskNumber: 108,
      title: 'Reply to fan DM about merch drop',
      status: 'todo',
      priority: 'low',
      category: 'fan-relations',
    }),
  ];
}

export function getScreenCertTasksFixture(): TaskListResult {
  return { tasks: buildScreenCertTasksFixtureTasks(), nextCursor: null };
}

export function getScreenCertTaskById(taskId: string): TaskView | null {
  return (
    buildScreenCertTasksFixtureTasks().find(task => task.id === taskId) ?? null
  );
}
