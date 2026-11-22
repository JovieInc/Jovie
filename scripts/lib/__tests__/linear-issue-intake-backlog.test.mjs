import { describe, expect, it, vi } from 'vitest';
import { upsertLinearIssueByTitleFingerprint } from '../linear-issue-intake.mjs';

// Filers never write Todo (2026-11-22: JOV Todo held 468 against a code target of 6). A caller asking
// for 'Todo' files into Backlog, and priority admission / the sub-lane refill promote it from there.
const team = {
  states: {
    nodes: [
      { id: 'todo-state', name: 'Todo', type: 'unstarted' },
      { id: 'backlog-state', name: 'Backlog', type: 'backlog' },
      { id: 'started-state', name: 'In Progress', type: 'started' },
    ],
  },
  labels: { nodes: [] },
};

function fetchWith(match) {
  return vi.fn(async (_url, init) => {
    const payload = JSON.parse(String(init.body));
    if (payload.query.includes('FindIssueByFingerprint')) {
      return Response.json({
        data: { team, issues: { nodes: match ? [match] : [] } },
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

function sent(fetchImpl, name) {
  const call = fetchImpl.mock.calls.find(([, init]) =>
    JSON.parse(String(init.body)).query.includes(name)
  );
  return call ? JSON.parse(String(call[1].body)).variables : null;
}

const args = {
  fingerprint: 'ci-red-main-abc',
  labelKey: 'ci-red-main',
  title: '[ci] main is red (ci-red-main-abc)',
  description: 'body',
  apiKey: 'lin-key',
};

describe('filers create and reopen in Backlog, never Todo', () => {
  it('maps a Todo create to Backlog and keeps the remediation label', async () => {
    const fetchImpl = fetchWith(null);
    await expect(
      upsertLinearIssueByTitleFingerprint({
        ...args,
        createStateName: 'Todo',
        priority: 1,
        fetchImpl,
      })
    ).resolves.toMatchObject({ ok: true, action: 'created' });
    const create = sent(fetchImpl, 'issueCreate');
    expect(create.stateId).toBe('backlog-state');
    expect(create.priority).toBe(1);
    // remediation:<key> is what places the issue in the remediation sub-lane.
    expect(create.labelIds).toEqual(['l']);
  });

  it('keeps any other requested state as asked', async () => {
    const fetchImpl = fetchWith(null);
    await upsertLinearIssueByTitleFingerprint({
      ...args,
      createStateName: 'In Progress',
      fetchImpl,
    });
    expect(sent(fetchImpl, 'issueCreate').stateId).toBe('started-state');
  });

  it('reopens a Done issue into Backlog even when the caller asked for Todo', async () => {
    const done = {
      id: 'old',
      identifier: 'JOV-2',
      title: args.title,
      state: { type: 'completed' },
      labels: { nodes: [] },
    };
    const fetchImpl = fetchWith(done);
    await expect(
      upsertLinearIssueByTitleFingerprint({
        ...args,
        createStateName: 'Todo',
        fetchImpl,
      })
    ).resolves.toMatchObject({ ok: true, reopened: true });
    expect(sent(fetchImpl, 'issueUpdate').input.stateId).toBe('backlog-state');
  });
});
