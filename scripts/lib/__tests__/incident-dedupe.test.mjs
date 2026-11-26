import { describe, expect, it, vi } from 'vitest';

import {
  clearRemediationLabelCache,
  upsertLinearIssueByTitleFingerprint,
} from '../linear-issue-intake.mjs';
import {
  applyRemediationDecision,
  canonicalFingerprint,
  INCIDENT_GROUPS,
} from '../remediation-signal.mjs';

const CANONICAL = 'production-monitor-vercel-deploy';
const MEMBERS = INCIDENT_GROUPS['production-not-promoted'].members;

function stub({ open = true, comments = [] } = {}) {
  const calls = [];
  const fetchImpl = vi.fn(async (_url, init) => {
    const payload = JSON.parse(String(init.body));
    calls.push(payload);
    const reply = data => new Response(JSON.stringify({ data }));
    const q = payload.query;
    if (q.includes('FindIncidentOwner')) {
      return reply({
        issues: {
          nodes: [
            {
              id: 'owner',
              identifier: 'JOV-7973',
              url: 'u',
              title: `P0: ${CANONICAL} is red (${CANONICAL})`,
              description: 'Source-workflow: production-release.yml',
              state: open
                ? { id: 's', name: 'In Progress', type: 'started' }
                : { id: 's', name: 'Done', type: 'completed' },
              labels: {
                nodes: [{ id: 'l', name: `remediation:${CANONICAL}` }],
              },
            },
          ],
        },
      });
    }
    if (q.includes('ListLinearIssueComments'))
      return reply({ issue: { comments: { nodes: comments } } });
    if (q.includes('AddLinearIssueComment'))
      return reply({ commentCreate: { success: true, comment: { id: 'c' } } });
    if (q.includes('FindTeamLabel'))
      return reply({ team: { labels: { nodes: [] } } });
    if (q.includes('FindIssueByFingerprint'))
      return reply({
        team: {
          states: {
            nodes: [{ id: 'st-todo', name: 'Todo', type: 'unstarted' }],
          },
        },
        issues: { nodes: [] },
      });
    if (q.includes('issueCreate'))
      return reply({
        issueCreate: {
          success: true,
          issue: { id: 'n', identifier: 'JOV-1', url: 'u' },
        },
      });
    throw new Error(`unexpected: ${q}`);
  });
  return { calls, fetchImpl };
}

const ctx = (fetchImpl, source) => ({
  source,
  runUrl: 'https://github.com/JovieInc/Jovie/actions/runs/9',
  detail: 'production-stale',
  apiKey: 'k',
  fetchImpl,
});

describe('one incident, one issue', () => {
  it('maps every monitor of the stale-production condition to the release gate owner', () => {
    for (const m of MEMBERS) expect(canonicalFingerprint(m)).toBe(CANONICAL);
    expect(canonicalFingerprint('e2e-login-timeout')).toBe('e2e-login-timeout');
  });

  it.each(MEMBERS.filter(m => m !== CANONICAL))(
    '%s comments on the open canonical issue and creates nothing',
    async fingerprint => {
      clearRemediationLabelCache();
      const run = stub();
      const result = await applyRemediationDecision(
        { action: 'red', fingerprint },
        ctx(run.fetchImpl, 'monitor.yml')
      );
      expect(result).toMatchObject({ ok: true, action: 'commented' });
      expect(run.calls.some(c => c.query.includes('issueCreate'))).toBe(false);
      const comment = run.calls.find(c =>
        c.query.includes('AddLinearIssueComment')
      );
      expect(comment.variables.body).toContain(fingerprint);
      expect(comment.variables.body).toContain('production-stale');
      expect(comment.variables.body).toContain('actions/runs/9');
    }
  );

  it('does not repeat identical evidence', async () => {
    clearRemediationLabelCache();
    const first = stub();
    await applyRemediationDecision(
      { action: 'red', fingerprint: 'production-monitor-continuity' },
      ctx(first.fetchImpl, 'production-continuity.yml')
    );
    const body = first.calls.find(c =>
      c.query.includes('AddLinearIssueComment')
    ).variables.body;
    const second = stub({ comments: [{ id: 'c', body, createdAt: 'x' }] });
    const result = await applyRemediationDecision(
      { action: 'red', fingerprint: 'production-monitor-continuity' },
      ctx(second.fetchImpl, 'production-continuity.yml')
    );
    expect(result.action).toBe('unchanged');
    expect(
      second.calls.some(c => c.query.includes('AddLinearIssueComment'))
    ).toBe(false);
  });

  it('files the canonical issue (with its own source) when none is open', async () => {
    clearRemediationLabelCache();
    const run = stub({ open: false });
    const result = await applyRemediationDecision(
      { action: 'red', fingerprint: 'production-monitor-controller-health' },
      ctx(run.fetchImpl, 'production-controller-health.yml')
    );
    expect(result.ok).toBe(true);
    const create = run.calls.find(c => c.query.includes('issueCreate'));
    expect(create.variables.title).toContain(CANONICAL);
    expect(create.variables.description).toContain(
      'Source-workflow: production-release.yml'
    );
    expect(create.variables.description).toContain(
      'production-monitor-controller-health'
    );
  });

  it('a member going green never resolves the shared incident', async () => {
    const run = stub();
    const result = await applyRemediationDecision(
      { action: 'green' },
      {
        ...ctx(run.fetchImpl, 'production-controller-health.yml'),
        fingerprint: 'production-monitor-controller-health',
      }
    );
    expect(result.results[0]).toMatchObject({
      action: 'none',
      reason: 'shared_incident_member',
    });
    expect(run.fetchImpl).not.toHaveBeenCalled();
  });
});

describe('freshness green may resolve the shared incident', () => {
  it('the continuity monitor resolves the canonical issue it measures', async () => {
    const calls = [];
    const fetchImpl = vi.fn(async (_u, init) => {
      const payload = JSON.parse(String(init.body));
      calls.push(payload);
      const reply = data => new Response(JSON.stringify({ data }));
      if (payload.query.includes('FindRemediationForGreen'))
        return reply({
          team: {
            states: { nodes: [{ id: 'd', name: 'Done', type: 'completed' }] },
          },
          issues: {
            nodes: [
              {
                id: 'owner',
                identifier: 'JOV-7973',
                url: 'u',
                title: `P0: ${CANONICAL} is red (${CANONICAL})`,
                description: 'Source-workflow: production-release.yml',
                state: { id: 's', name: 'In Progress', type: 'started' },
                labels: {
                  nodes: [{ id: 'l', name: `remediation:${CANONICAL}` }],
                },
              },
            ],
          },
        });
      if (payload.query.includes('AddLinearIssueComment'))
        return reply({
          commentCreate: { success: true, comment: { id: 'c' } },
        });
      return reply({
        issueUpdate: {
          success: true,
          issue: { id: 'owner', identifier: 'JOV-7973', url: 'u' },
        },
      });
    });
    const result = await applyRemediationDecision(
      { action: 'green' },
      {
        ...ctx(fetchImpl, 'production-continuity.yml'),
        fingerprint: 'production-monitor-continuity',
      }
    );
    expect(/** @type {any} */ (result.results[0]).action).toBe('resolved');
  });
});

// Filers never write Todo (2026-11-22: JOV Todo held 468 against a code target of 6). A caller asking
// for 'Todo' files into Backlog, and priority admission / the sub-lane refill promote it from there.
const backlogTeam = {
  states: {
    nodes: [
      { id: 'todo-state', name: 'Todo', type: 'unstarted' },
      { id: 'backlog-state', name: 'Backlog', type: 'backlog' },
      { id: 'started-state', name: 'In Progress', type: 'started' },
    ],
  },
  labels: { nodes: [] },
};

function backlogFetch(match) {
  return vi.fn(async (_url, init) => {
    const payload = JSON.parse(String(init.body));
    if (payload.query.includes('FindIssueByFingerprint')) {
      return Response.json({
        data: { team: backlogTeam, issues: { nodes: match ? [match] : [] } },
      });
    }
    if (payload.query.includes('FindIssueByRemediationLabel')) {
      return Response.json({ data: { issues: { nodes: [] } } });
    }
    if (payload.query.includes('issueLabelCreate')) {
      return Response.json({
        data: { issueLabelCreate: { success: true, issueLabel: { id: 'l' } } },
      });
    }
    if (payload.query.includes('issueCreate')) {
      return Response.json({
        data: {
          issueCreate: {
            success: true,
            issue: { id: 'new', identifier: 'JOV-1', url: 'u' },
          },
        },
      });
    }
    return Response.json({
      data: {
        issueUpdate: {
          success: true,
          issue: { id: 'old', identifier: 'JOV-2' },
        },
      },
    });
  });
}

function sentVars(fetchImpl, name) {
  const call = fetchImpl.mock.calls.find(([, init]) =>
    JSON.parse(String(init.body)).query.includes(name)
  );
  return call ? JSON.parse(String(call[1].body)).variables : null;
}

const filed = {
  fingerprint: 'ci-red-main-abc',
  labelKey: 'ci-red-main',
  title: '[ci] main is red (ci-red-main-abc)',
  description: 'body',
  apiKey: 'lin-key',
};

describe('filers create and reopen in Backlog, never Todo', () => {
  it('maps a Todo create to Backlog and keeps the remediation label', async () => {
    const fetchImpl = backlogFetch(null);
    await expect(
      upsertLinearIssueByTitleFingerprint({
        ...filed,
        createStateName: 'Todo',
        priority: 1,
        fetchImpl,
      })
    ).resolves.toMatchObject({ ok: true, action: 'created' });
    const create = sentVars(fetchImpl, 'issueCreate');
    expect(create.stateId).toBe('backlog-state');
    expect(create.priority).toBe(1);
    // remediation:<key> is what places the issue in the remediation sub-lane.
    expect(create.labelIds).toEqual(['l']);
  });

  it('keeps any other requested state as asked', async () => {
    const fetchImpl = backlogFetch(null);
    await upsertLinearIssueByTitleFingerprint({
      ...filed,
      createStateName: 'In Progress',
      fetchImpl,
    });
    expect(sentVars(fetchImpl, 'issueCreate').stateId).toBe('started-state');
  });

  it('reopens a Done issue into Backlog even when the caller asked for Todo', async () => {
    const done = {
      id: 'old',
      identifier: 'JOV-2',
      title: filed.title,
      state: { type: 'completed' },
      labels: { nodes: [] },
    };
    const fetchImpl = backlogFetch(done);
    await expect(
      upsertLinearIssueByTitleFingerprint({
        ...filed,
        createStateName: 'Todo',
        fetchImpl,
      })
    ).resolves.toMatchObject({ ok: true, reopened: true });
    expect(sentVars(fetchImpl, 'issueUpdate').input.stateId).toBe(
      'backlog-state'
    );
  });
});

// binding_refill.ACCEPTANCE and MIN_DESCRIPTION: what admission needs to promote from Backlog.
const READY =
  /acceptance|accept\b|\bverif(?:y|ication)\b|required outcome|definition of done|\bdone bar\b|(?:^|\n)#+[ \t]*done\b/i;

describe('filed remediation passes the admission readiness check', () => {
  it('adds a definition of done when the body has no acceptance criteria', async () => {
    const fetchImpl = backlogFetch(null);
    await upsertLinearIssueByTitleFingerprint({
      ...filed,
      description: 'Run 12 failed.',
      fetchImpl,
    });
    const { description } = sentVars(fetchImpl, 'issueCreate');
    expect(description).toMatch(READY);
    expect(description).toContain('## Definition of done');
    expect(description).toContain('`remediation:ci-red-main` is green on main');
    expect(description.length).toBeGreaterThanOrEqual(200);
  });

  it('leaves a body that already states its acceptance criteria alone', async () => {
    const fetchImpl = backlogFetch(null);
    const description = 'Broken.\n\n## Acceptance criteria\n- [ ] green';
    await upsertLinearIssueByTitleFingerprint({
      ...filed,
      description,
      fetchImpl,
    });
    expect(sentVars(fetchImpl, 'issueCreate').description).not.toContain(
      'Definition of done'
    );
  });
});
