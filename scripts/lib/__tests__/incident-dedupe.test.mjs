import { describe, expect, it, vi } from 'vitest';

import { clearRemediationLabelCache } from '../linear-issue-intake.mjs';
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
    expect(result.results[0].action).toBe('resolved');
  });
});
