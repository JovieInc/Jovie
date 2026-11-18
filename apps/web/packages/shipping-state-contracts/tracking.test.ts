import { describe, expect, it } from 'vitest';
import type { OperationalTaskPullRequest } from './operational-task';
import {
  codexCloudContainer,
  groupTrackingTasksByStatus,
  isCodexCloudContainer,
  mapCodexCloudTask,
  mapGitHubPullRequest,
  mapLinearState,
  resolveTrackingStatus,
  sortTrackingTasks,
  TRACKING_STATUS_GROUP_ORDER,
  TRACKING_STATUSES,
  type TrackingPullRequestInput,
  type TrackingTask,
  toTrackingTask,
  trackingStatusRank,
  workflowStateDetail,
  workflowStateToTrackingStatus,
} from './tracking';
import schemaJson from './tracking-task.schema.json';

describe('workflowStateToTrackingStatus', () => {
  it('maps every operational workflow state', () => {
    expect(workflowStateToTrackingStatus('queued')).toBe('queued');
    expect(workflowStateToTrackingStatus('running')).toBe('running');
    expect(workflowStateToTrackingStatus('retrying')).toBe('running');
    expect(workflowStateToTrackingStatus('blocked')).toBe('blocked');
    expect(workflowStateToTrackingStatus('in-review')).toBe('in-review');
    expect(workflowStateToTrackingStatus('merge-queued')).toBe('in-review');
    expect(workflowStateToTrackingStatus('merged')).toBe('done');
    expect(workflowStateToTrackingStatus('production-verified')).toBe('done');
  });

  it('keeps collapsed states visible through statusDetail', () => {
    expect(workflowStateDetail('retrying')).toBe('Retrying');
    expect(workflowStateDetail('merge-queued')).toBe('Merge queued');
    expect(workflowStateDetail('production-verified')).toBe(
      'Production verified'
    );
    expect(workflowStateDetail('running')).toBeNull();
    expect(workflowStateDetail('queued')).toBeNull();
  });
});

describe('mapLinearState', () => {
  it('maps every documented Linear state name', () => {
    expect(mapLinearState('Backlog')).toBe('queued');
    expect(mapLinearState('Todo')).toBe('queued');
    expect(mapLinearState('Triage')).toBe('queued');
    expect(mapLinearState('In Progress')).toBe('running');
    expect(mapLinearState('In Review')).toBe('in-review');
    expect(mapLinearState('Blocked')).toBe('blocked');
    expect(mapLinearState('Done')).toBe('done');
    expect(mapLinearState('Completed')).toBe('done');
    expect(mapLinearState('Canceled')).toBe('cancelled');
    expect(mapLinearState('Cancelled')).toBe('cancelled');
  });

  it('trims and is case-insensitive', () => {
    expect(mapLinearState('  in progress  ')).toBe('running');
    expect(mapLinearState('CANCELLED')).toBe('cancelled');
  });

  it('returns null for unknown names — never a queued default', () => {
    expect(mapLinearState('Started')).toBeNull();
    expect(mapLinearState('Wontfix')).toBeNull();
    expect(mapLinearState('')).toBeNull();
  });
});

describe('mapGitHubPullRequest', () => {
  it('merged PRs are done, even when still marked closed', () => {
    expect(mapGitHubPullRequest({ state: 'open', merged: true })).toBe('done');
    expect(
      mapGitHubPullRequest({
        state: 'closed',
        mergedAt: '2026-11-10T00:00:00Z',
      })
    ).toBe('done');
  });

  it('closed unmerged PRs are cancelled', () => {
    expect(mapGitHubPullRequest({ state: 'closed', merged: false })).toBe(
      'cancelled'
    );
  });

  it('merge-queue membership is in-review', () => {
    expect(mapGitHubPullRequest({ state: 'open', queueState: 'QUEUED' })).toBe(
      'in-review'
    );
    expect(mapGitHubPullRequest({ state: 'open', queuePosition: 1 })).toBe(
      'in-review'
    );
  });

  it('pending checks on an open PR are running', () => {
    expect(
      mapGitHubPullRequest({ state: 'open', checksRollup: 'pending' })
    ).toBe('running');
  });

  it('open ready-for-review PRs are in-review', () => {
    expect(
      mapGitHubPullRequest({ state: 'open', checksRollup: 'success' })
    ).toBe('in-review');
  });

  it('failing checks on a still-open PR never become failed', () => {
    expect(
      mapGitHubPullRequest({ state: 'open', checksRollup: 'failure' })
    ).toBe('in-review');
  });

  it('open with no running checks is queued', () => {
    expect(
      mapGitHubPullRequest({ state: 'open', checksRollup: 'unknown' })
    ).toBe('queued');
    expect(mapGitHubPullRequest({ state: 'open' })).toBe('queued');
  });

  it('no PR evidence is null — not queued, not done', () => {
    expect(mapGitHubPullRequest({})).toBeNull();
    expect(mapGitHubPullRequest({ state: null })).toBeNull();
    expect(mapGitHubPullRequest({ state: 'migrated' })).toBeNull();
    expect(mapGitHubPullRequest({ merged: false })).toBeNull();
  });
});

describe('mapCodexCloudTask', () => {
  it('maps run statuses, including success variants that do NOT force done', () => {
    expect(mapCodexCloudTask('pending')).toBe('queued');
    expect(mapCodexCloudTask('queued')).toBe('queued');
    expect(mapCodexCloudTask('in_progress')).toBe('running');
    expect(mapCodexCloudTask('in-progress')).toBe('running');
    expect(mapCodexCloudTask('running')).toBe('running');
    expect(mapCodexCloudTask('succeeded')).toBeNull();
    expect(mapCodexCloudTask('completed')).toBeNull();
    expect(mapCodexCloudTask('failed')).toBe('failed');
    expect(mapCodexCloudTask('error')).toBe('failed');
    expect(mapCodexCloudTask('cancelled')).toBe('cancelled');
    expect(mapCodexCloudTask('canceled')).toBe('cancelled');
  });

  it('unknown run statuses are null — never queued or done', () => {
    expect(mapCodexCloudTask('parked')).toBeNull();
    expect(mapCodexCloudTask('')).toBeNull();
    expect(mapCodexCloudTask(null)).toBeNull();
    expect(mapCodexCloudTask(undefined)).toBeNull();
  });
});

describe('showCodexMark', () => {
  it('is true only for a codex-cloud container', () => {
    expect(isCodexCloudContainer(codexCloudContainer({ id: 'run-1' }))).toBe(
      true
    );
    expect(
      isCodexCloudContainer({ kind: 'local', id: null, label: null, url: null })
    ).toBe(false);
    expect(
      isCodexCloudContainer({
        kind: 'github-actions',
        id: null,
        label: null,
        url: null,
      })
    ).toBe(false);
  });

  it('a codex/ branch prefix alone does NOT set the mark', () => {
    const task = toTrackingTask({
      id: 'linear:JOV-1',
      linearIdentifier: 'JOV-1',
      title: 'Local codex CLI lane',
      workflowState: 'running',
      agent: 'codex',
      pullRequest: { state: 'open', agent: 'codex' },
    });
    expect(task.agent).toBe('codex');
    expect(task.container).toBeNull();
    expect(task.showCodexMark).toBe(false);
  });

  it('a null container stays null and never invents local', () => {
    const task = toTrackingTask({
      id: 'linear:JOV-2',
      linearIdentifier: 'JOV-2',
      title: 'No container evidence',
      workflowState: 'queued',
    });
    expect(task.container).toBeNull();
    expect(task.showCodexMark).toBe(false);
  });
});

describe('resolveTrackingStatus precedence', () => {
  it('explicit terminal Codex failed wins over a live running workflow state', () => {
    expect(
      resolveTrackingStatus({
        workflowState: 'running',
        codexCloudStatus: 'failed',
      })
    ).toBe('failed');
  });

  it('explicit Linear cancelled wins over a live running workflow state', () => {
    expect(
      resolveTrackingStatus({
        workflowState: 'running',
        linearStateName: 'Cancelled',
      })
    ).toBe('cancelled');
  });

  it('non-terminal Codex run status defers to the live workflow state', () => {
    expect(
      resolveTrackingStatus({
        workflowState: 'merge-queued',
        codexCloudStatus: 'queued',
      })
    ).toBe('in-review');
  });

  it('falls back to the GitHub rollup, then Linear state, then Codex', () => {
    expect(
      resolveTrackingStatus({
        pullRequest: { state: 'open', checksRollup: 'pending' },
      })
    ).toBe('running');
    expect(resolveTrackingStatus({ linearStateName: 'In Review' })).toBe(
      'in-review'
    );
    expect(resolveTrackingStatus({ codexCloudStatus: 'in_progress' })).toBe(
      'running'
    );
  });

  it('refuses to invent a status when no signal resolves', () => {
    expect(() => resolveTrackingStatus({})).toThrow(/refusing to invent/);
  });
});

describe('toTrackingTask', () => {
  const operationalPr: OperationalTaskPullRequest = {
    number: 4242,
    url: 'https://github.com/JovieInc/Jovie/pull/4242',
    branch: 'glm/jov-1-x',
    agent: 'glm',
    isDraft: false,
    checks: { rollup: 'failure', failing: ['ci-fast'] },
    queuePosition: null,
    queueState: null,
    createdAt: '2026-11-01T00:00:00Z',
  };

  it('composes a full row from an operational task shape', () => {
    const task = toTrackingTask({
      id: 'linear:JOV-300',
      linearIdentifier: 'JOV-300',
      linearUrl: 'https://linear.app/jovie/issue/JOV-300',
      title: 'Ship the thing',
      workflowState: 'retrying',
      priority: 'high',
      agent: 'glm',
      pullRequest: operationalPr,
      updatedAt: '2026-11-09T10:00:00Z',
    });
    expect(task.status).toBe('running');
    expect(task.statusDetail).toBe('Retrying');
    expect(task.workflowState).toBe('retrying');
    expect(task.agent).toBe('glm');
    expect(task.pullRequest).toEqual({
      number: 4242,
      url: 'https://github.com/JovieInc/Jovie/pull/4242',
      checksRollup: 'failure',
    });
    expect(task.container).toBeNull();
    expect(task.showCodexMark).toBe(false);
    expect(task.priority).toBe('high');
  });

  it('an explicit codex-cloud container earns the mark', () => {
    const task = toTrackingTask({
      id: 'linear:JOV-301',
      linearIdentifier: 'JOV-301',
      title: 'Codex cloud run',
      workflowState: 'running',
      container: codexCloudContainer({
        id: 'run-9',
        url: 'https://openai.com/codex/run-9',
      }),
    });
    expect(task.container?.kind).toBe('codex-cloud');
    expect(task.showCodexMark).toBe(true);
  });

  it('explicit statusDetail overrides the workflow-state default', () => {
    const task = toTrackingTask({
      id: 'linear:JOV-302',
      linearIdentifier: 'JOV-302',
      title: 'Custom detail',
      workflowState: 'merge-queued',
      statusDetail: 'Waiting on queue slot',
    });
    expect(task.status).toBe('in-review');
    expect(task.statusDetail).toBe('Waiting on queue slot');
  });

  it('null updatedAt and unknown priority normalize', () => {
    const task = toTrackingTask({
      id: 'linear:JOV-303',
      linearIdentifier: 'JOV-303',
      title: 'Bare row',
      workflowState: 'queued',
    });
    expect(task.updatedAt).toBeNull();
    expect(task.priority).toBe('none');
    expect(task.pullRequest).toBeNull();
    expect(task.agent).toBeNull();
  });
});

describe('sort and group order', () => {
  const row = (
    id: string,
    status: TrackingTask['status'],
    updatedAt: string | null
  ): TrackingTask => ({
    id: `linear:${id}`,
    linearIdentifier: id,
    linearUrl: null,
    title: id,
    status,
    statusDetail: null,
    workflowState: null,
    container: null,
    showCodexMark: false,
    agent: null,
    pullRequest: null,
    updatedAt,
    priority: 'none',
  });

  it('groups in the fixed presentation order', () => {
    expect(TRACKING_STATUS_GROUP_ORDER).toEqual([
      'blocked',
      'failed',
      'running',
      'in-review',
      'queued',
      'done',
      'cancelled',
    ]);
    expect(TRACKING_STATUSES).toHaveLength(7);
    for (const status of TRACKING_STATUSES) {
      expect(trackingStatusRank(status)).toBeGreaterThanOrEqual(0);
    }
  });

  it('sorts by group, then most recently updated, null updatedAt last', () => {
    const tasks: TrackingTask[] = [
      row('JOV-A', 'done', '2026-11-01T00:00:00Z'),
      row('JOV-B', 'running', '2026-11-03T00:00:00Z'),
      row('JOV-C', 'failed', '2026-11-02T00:00:00Z'),
      row('JOV-D', 'running', null),
      row('JOV-E', 'running', '2026-11-05T00:00:00Z'),
      row('JOV-F', 'blocked', '2026-11-01T00:00:00Z'),
      row('JOV-G', 'running', null),
    ];
    const sorted = sortTrackingTasks(tasks);
    expect(sorted.map(t => t.linearIdentifier)).toEqual([
      'JOV-F',
      'JOV-C',
      'JOV-E',
      'JOV-B',
      'JOV-D',
      'JOV-G',
      'JOV-A',
    ]);
  });

  it('group helper buckets every row and keeps every key present', () => {
    const groups = groupTrackingTasksByStatus([
      row('JOV-A', 'done', null),
      row('JOV-B', 'blocked', null),
      row('JOV-C', 'cancelled', null),
    ]);
    expect(Object.keys(groups)).toEqual(TRACKING_STATUS_GROUP_ORDER);
    expect(groups.blocked.map(t => t.linearIdentifier)).toEqual(['JOV-B']);
    expect(groups.failed).toEqual([]);
    expect(groups.done.map(t => t.linearIdentifier)).toEqual(['JOV-A']);
    expect(groups.cancelled.map(t => t.linearIdentifier)).toEqual(['JOV-C']);
  });
});

describe('tracking-task.schema.json', () => {
  it('parses and mirrors the tracking enums', () => {
    const schema = schemaJson as {
      $defs: Record<string, { enum?: string[] }>;
      required: string[];
    };
    expect(schema.$defs.TrackingStatus.enum).toEqual([...TRACKING_STATUSES]);
    expect(schema.$defs.TrackingExecutorKind.enum).toEqual([
      'codex-cloud',
      'hyperagent',
      'local',
      'github-actions',
      'unknown',
    ]);
    expect(schema.required).toContain('showCodexMark');
    expect(schema.required).toContain('container');
  });

  it('carries the full TrackingPullRequestInput state for queue membership', () => {
    const pr: TrackingPullRequestInput = {
      state: 'open',
      queueState: 'QUEUED',
    };
    expect(mapGitHubPullRequest(pr)).toBe('in-review');
  });
});
