import { describe, expect, it } from 'vitest';
import {
  conflictRemediationResolved,
  doctorOwnedIssue,
  normalizePullRequest,
} from '../linear-conflict-holds.mjs';
import { reconcileIssueLifecycle } from '../linear-sync-on-merge.mjs';

describe('normalizePullRequest (relocated, JOV-14764)', () => {
  it('normalizes pull records defensively', () => {
    expect(
      normalizePullRequest({
        number: 7,
        title: 't',
        body: 'b',
        state: 'OPEN',
        isDraft: true,
        head: { ref: 'x' },
        html_url: 'u',
      })
    ).toEqual({
      number: 7,
      title: 't',
      body: 'b',
      state: 'open',
      draft: true,
      headRef: 'x',
      url: 'u',
    });
    expect(normalizePullRequest(null)).toEqual({
      number: 0,
      title: '',
      body: '',
      state: '',
      draft: false,
      headRef: '',
      url: '',
    });
    expect(normalizePullRequest({ number: 'x', headRefName: 'h', url: 'u2' }).number).toBe(0);
  });
});

describe('conflictRemediationResolved (relocated, JOV-14764)', () => {
  const issue = { labels: ['remediation:pr-22-conflict'] };
  it('stays unresolved while a complete scan still lists the pull request', () => {
    expect(
      conflictRemediationResolved(issue, { pulls: [{ number: 22 }], complete: true })
    ).toBe(false);
  });
  it('resolves when a complete scan no longer lists the pull request', () => {
    expect(conflictRemediationResolved(issue, { pulls: [], complete: true })).toBe(true);
  });
  it('proves nothing on an incomplete scan or without the label', () => {
    expect(conflictRemediationResolved(issue, { pulls: [], complete: false })).toBeNull();
    expect(conflictRemediationResolved({ labels: [] }, { pulls: [], complete: true })).toBeNull();
  });
});

describe('doctorOwnedIssue (JOV-14764)', () => {
  it('recognizes doctor-key and doctor-fix body markers', () => {
    expect(doctorOwnedIssue({ description: 'alert\n<!-- doctor-key:abc123 -->\n' })).toBe(true);
    expect(
      doctorOwnedIssue({ description: `<!-- doctor-fix:${'a'.repeat(40)} -->` })
    ).toBe(true);
  });
  it('is false for ordinary issues and missing bodies', () => {
    expect(doctorOwnedIssue({ description: 'plain body' })).toBe(false);
    expect(doctorOwnedIssue({})).toBe(false);
    expect(doctorOwnedIssue(null)).toBe(false);
  });
});

describe('reconcileIssueLifecycle doctor exclusion (JOV-14764)', () => {
  it('skips doctor-owned issues: only the lanes doctor moves them', async () => {
    const logs = [];
    const result = await reconcileIssueLifecycle({
      issue: /** @type {any} */ ({
        id: 'i1',
        identifier: 'JOV-1',
        description: 'alert\n<!-- doctor-key:deadbeef -->',
      }),
      log: message => {
        logs.push(message);
      },
    });
    expect(result.action).toBe('skip');
    expect(result.identifier).toBe('JOV-1');
    expect(logs[0]).toContain('doctor-owned');
  });
  it('still enters the lifecycle for ordinary issues', async () => {
    await expect(
      reconcileIssueLifecycle({
        issue: /** @type {any} */ ({ id: 'i2', identifier: 'JOV-2', description: 'plain body' }),
        log: () => {},
      })
    ).rejects.toThrow();
  });
});
