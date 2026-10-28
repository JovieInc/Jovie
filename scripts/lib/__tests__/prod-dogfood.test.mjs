import { describe, expect, it } from 'vitest';
import {
  buildReceipt,
  certificationState,
  findingIssue,
  MISSIONS,
  weeklyDefectMetrics,
} from '../prod-dogfood.mjs';

const BASE = 'https://jov.ie';
const SHA = 'a'.repeat(40);

describe('receipts and certification', () => {
  const mission = MISSIONS.find(m => m.id === 'dogfood:published-links');
  const binding = { commitSha: SHA, deploymentId: 'dpl_1' };
  const t = '2026-10-25T01:00:00.000Z';

  it('a failed check makes a failed receipt bound to the deployed sha', () => {
    const r = buildReceipt({
      mission,
      checks: [{ id: 'inbound-link-resolves', status: 'failed' }],
      binding,
      startedAt: t,
      completedAt: t,
    });
    expect(r).toMatchObject({
      outcome: 'failed',
      commitSha: SHA,
      deploymentId: 'dpl_1',
      environment: 'production',
      driver: 'playwright',
    });
    expect(r.blocker).toMatch(/inbound-link-resolves/);
  });

  it('blocked missions are never certified', () => {
    const blocked = MISSIONS.find(m => m.automation === 'blocked');
    const r = buildReceipt({
      mission: blocked,
      checks: [],
      binding,
      startedAt: t,
      completedAt: t,
    });
    expect(r.outcome).toBe('blocked');
    const state = certificationState({
      receipts: [r],
      servedSha: SHA,
      generatedAt: t,
    });
    expect(state.missions.find(m => m.missionId === blocked.id).status).toBe(
      'uncertified:blocked'
    );
  });

  it('certifies only when the receipt sha equals the sha still being served', () => {
    const pass = buildReceipt({
      mission,
      checks: [{ id: 'inbound-link-resolves', status: 'passed' }],
      binding,
      startedAt: t,
      completedAt: t,
    });
    expect(
      certificationState({
        receipts: [pass],
        servedSha: SHA,
        generatedAt: t,
      }).missions.find(m => m.missionId === mission.id).status
    ).toBe('certified');
    expect(
      certificationState({
        receipts: [pass],
        servedSha: 'b'.repeat(40),
        generatedAt: t,
      }).missions.find(m => m.missionId === mission.id).status
    ).toBe('uncertified:stale-sha');
  });

  it('files an issue with evidence, expectation, severity and an invariant proposal', () => {
    const check = {
      id: 'inbound-link-resolves',
      target: `${BASE}/tim/take-me-over`,
      status: 'failed',
      severity: 'P1',
      summary: 'published link returns 404',
      expected: '200',
      actual: 'HTTP 404',
      url: `${BASE}/tim/take-me-over`,
      source: 'YouTube uz3IZdedIJE',
    };
    const issue = findingIssue({
      check,
      mission,
      binding,
      runUrl: 'https://github.com/run/1',
    });
    expect(issue.priority).toBe(2);
    expect(issue.title).toContain(issue.fingerprint);
    expect(issue.description).toContain('YouTube uz3IZdedIJE');
    expect(issue.description).toContain('Invariant: every jov.ie URL');
    expect(issue.description).toContain(`Fingerprint: ${issue.fingerprint}`);
  });
});

describe('weekly metric', () => {
  it('counts agent-found vs Tim-found per ISO week', () => {
    const now = new Date('2026-10-25T00:00:00Z');
    const rows = weeklyDefectMetrics(
      [
        { createdAt: '2026-10-24T10:00:00Z', labels: ['dogfood-agent'] },
        { createdAt: '2026-10-23T10:00:00Z', labels: ['dogfood-agent'] },
        { createdAt: '2026-10-22T10:00:00Z', labels: ['escaped-defect'] },
        { createdAt: '2026-10-14T10:00:00Z', labels: ['escaped-defect'] },
      ],
      { now, weeks: 2 }
    );
    expect(rows).toEqual([
      { week: '2026-10-12', agentFound: 0, timFound: 1, agentShare: 0 },
      { week: '2026-10-19', agentFound: 2, timFound: 1, agentShare: 0.67 },
    ]);
  });
});
