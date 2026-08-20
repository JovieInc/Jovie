import { describe, expect, it } from 'vitest';
import { isOpenAgentPrBranch } from '../agent-branch-pattern.mjs';
import {
  buildNotifyText,
  canCloseAfterNotify,
  closeStaleNeedsHumanAgentPrs,
  extractLinearIdentifier,
  selectStaleNeedsHumanAgentPrs,
} from '../needs-human-autoclose.mjs';

const NOW = Date.parse('2026-08-19T12:00:00.000Z');
const STALE = '2026-08-16T12:00:00.000Z';
const FRESH = '2026-08-19T10:00:00.000Z';

function pr(overrides = {}) {
  return {
    number: 1,
    title: 'fix(agent): example',
    headRefName: 'tim/jov-5235-fix',
    updatedAt: STALE,
    labels: ['needs-human'],
    body: '<!-- linear-issue-id:JOV-5235 -->',
    url: 'https://github.com/JovieInc/Jovie/pull/1',
    ...overrides,
  };
}

describe('needs-human autoclose', () => {
  it('extracts Linear identifiers from PR body or jov branch names', () => {
    expect(
      extractLinearIdentifier({
        headRefName: 'fallback/unrelated',
        body: '<!-- linear-issue-identifier:JOV-12 -->',
      })
    ).toBe('JOV-12');
    expect(
      extractLinearIdentifier({
        headRefName: 'codex/jov-99-fix',
        body: '',
      })
    ).toBe('JOV-99');
    expect(
      extractLinearIdentifier({ headRefName: 'hotfix/prod', body: '' })
    ).toBe('');
  });

  it('selects only stale allowlisted agent PRs', () => {
    const selected = selectStaleNeedsHumanAgentPrs(
      [
        pr(),
        pr({ number: 2, headRefName: 'hotfix/prod' }),
        pr({ number: 3, updatedAt: FRESH }),
        pr({ number: 4, labels: ['hold'] }),
        pr({ number: 5, headRefName: 'feature/human-work' }),
      ],
      { now: NOW }
    );
    expect(selected.map(item => item.number)).toEqual([1]);
    expect(isOpenAgentPrBranch('hotfix/prod')).toBe(false);
    expect(isOpenAgentPrBranch('tim/jov-5235-fix')).toBe(true);
  });

  it('refuses close until Slack, and Linear when present, succeed', () => {
    expect(canCloseAfterNotify({ slackOk: false, linearIdentifier: '' })).toBe(
      false
    );
    expect(
      canCloseAfterNotify({
        slackOk: true,
        linearIdentifier: 'JOV-5235',
        linearOk: false,
      })
    ).toBe(false);
    expect(canCloseAfterNotify({ slackOk: true, linearIdentifier: '' })).toBe(
      true
    );
    expect(
      canCloseAfterNotify({
        slackOk: true,
        linearIdentifier: 'JOV-5235',
        linearOk: true,
      })
    ).toBe(true);
  });

  it('notifies Slack and Linear before closing', async () => {
    const closed = [];
    const fetchCalls = [];
    const result = await closeStaleNeedsHumanAgentPrs({
      slackWebhookUrl: 'https://hooks.slack.test/xxx',
      linearApiKey: 'lin_api_test',
      now: NOW,
      ghJson: () => JSON.stringify([pr()]),
      closePr: (number, comment) => {
        closed.push({ number, comment });
      },
      fetchImpl: async (url, init) => {
        fetchCalls.push({ url: String(url), body: String(init?.body ?? '') });
        if (String(url).includes('hooks.slack.test')) {
          return { ok: true, json: async () => ({}) };
        }
        if (String(init?.body ?? '').includes('query Issue')) {
          return {
            ok: true,
            json: async () => ({ data: { issue: { id: 'issue-1' } } }),
          };
        }
        return {
          ok: true,
          json: async () => ({ data: { commentCreate: { success: true } } }),
        };
      },
      log: () => {},
    });

    expect(result).toEqual({ closed: [1], skipped: [] });
    expect(closed).toHaveLength(1);
    expect(closed[0].comment).toContain('not a merge blocker');
    expect(fetchCalls[0].url).toContain('hooks.slack.test');
    expect(fetchCalls.some(call => call.body.includes('commentCreate'))).toBe(
      true
    );
    expect(buildNotifyText(pr())).toContain('not a merge blocker');
  });

  it('does not close when Slack notify fails', async () => {
    const closed = [];
    const result = await closeStaleNeedsHumanAgentPrs({
      slackWebhookUrl: '',
      now: NOW,
      ghJson: () => JSON.stringify([pr({ body: '' })]),
      closePr: number => {
        closed.push(number);
      },
      log: () => {},
    });
    expect(result.skipped).toEqual([1]);
    expect(closed).toEqual([]);
  });
});
