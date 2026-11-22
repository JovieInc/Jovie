import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import {
  checkOutcomeCoverage,
  outcomeFingerprint,
  readOutcomeBaseline,
  reportsOutcome,
  scanOutcomeCoverage,
  unattendedTriggers,
} from '../outcome-coverage.mjs';
import {
  HUMAN_AFTER,
  noteRecurrence,
  RECURRENCE_MARKER,
  recurrenceComment,
  recurrenceCount,
} from '../remediation-recurrence.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

describe('outcome coverage gate (nothing fails without a repair or a success)', () => {
  const rows = scanOutcomeCoverage(repoRoot);
  const baseline = readOutcomeBaseline(repoRoot);

  it('every unattended workflow reports its outcome or is a known, shrinking gap', () => {
    const { newGaps, stale } = checkOutcomeCoverage(rows, baseline);
    expect(
      newGaps,
      'New unattended workflow with no outcome reporting. Add a last job that runs .github/actions/report-outcome with `if: always()`.'
    ).toEqual([]);
    expect(
      stale,
      'These now report their outcome or are gone. Delete them from canon/outcome-coverage-baseline.json.'
    ).toEqual([]);
  });

  it('the baseline stays sorted and unique', () => {
    expect(baseline).toEqual([...new Set(baseline)].sort());
  });

  it('the wired lanes that were failing silently now report', () => {
    const covered = new Set(rows.filter(r => r.covered).map(r => r.file));
    for (const file of [
      'e2e-full-matrix.yml',
      'nightly-tests.yml',
      'node-runtime-compatibility.yml',
      'screenshots.yml',
      'test-coverage-audit.yml',
      'visual-regression.yml',
      'vs-linktree-claims.yml',
    ]) {
      expect(covered.has(file), file).toBe(true);
    }
  });
});

describe('unattendedTriggers', () => {
  it('keeps schedules, chains, dispatches and post-merge pushes', () => {
    expect(unattendedTriggers({ schedule: [{ cron: '0 0 * * *' }] })).toEqual([
      'schedule',
    ]);
    expect(unattendedTriggers({ workflow_run: { workflows: ['CI'] } })).toEqual(
      ['workflow_run:CI']
    );
    expect(
      unattendedTriggers({ repository_dispatch: { types: ['clock_x'] } })
    ).toEqual(['repository_dispatch:clock_x']);
    expect(unattendedTriggers({ push: { branches: ['main'] } })).toEqual([
      'push:main',
    ]);
    expect(unattendedTriggers('push')).toEqual(['push:main']);
  });

  it('ignores PR gates, manual runs and pushes that never reach main', () => {
    expect(
      unattendedTriggers({ pull_request: null, push: { branches: ['main'] } })
    ).toEqual([]);
    expect(unattendedTriggers({ workflow_dispatch: null })).toEqual([]);
    expect(unattendedTriggers({ push: { branches: ['release/*'] } })).toEqual(
      []
    );
    expect(unattendedTriggers({ push: { tags: ['v*'] } })).toEqual([]);
  });
});

describe('reportsOutcome', () => {
  it('accepts the shared action, a monitor intake or a named outside owner', () => {
    expect(reportsOutcome('- uses: ./.github/actions/report-outcome')).toBe(
      true
    );
    expect(reportsOutcome("REMEDIATION_MODE: 'monitor'")).toBe(true);
    expect(reportsOutcome('# outcome-owner: rolling CI filer')).toBe(true);
  });

  it('does not count a Slack ping or an empty owner line', () => {
    expect(reportsOutcome('SLACK_WEBHOOK_URL: x')).toBe(false);
    expect(reportsOutcome('# outcome-owner:')).toBe(false);
    expect(reportsOutcome('REMEDIATION_MODE: login')).toBe(false);
  });
});

describe('checkOutcomeCoverage', () => {
  it('reports new gaps and stale baseline lines', () => {
    const result = checkOutcomeCoverage(
      [
        { file: 'a.yml', covered: false },
        { file: 'b.yml', covered: true },
        { file: 'c.yml', covered: false },
      ],
      ['b.yml', 'c.yml', 'gone.yml']
    );
    expect(result).toEqual({
      newGaps: ['a.yml'],
      stale: ['b.yml', 'gone.yml'],
    });
  });
});

describe('outcomeFingerprint matches the action default', () => {
  it('derives workflow-<stem>', () => {
    expect(outcomeFingerprint('.github/workflows/visual-regression.yml')).toBe(
      'workflow-visual-regression'
    );
    expect(outcomeFingerprint('E2E_Full.Matrix.yaml')).toBe(
      'workflow-e2e-full-matrix'
    );
  });
});

describe('noteRecurrence', () => {
  function fakeLinear(existing) {
    const calls = [];
    const fetchImpl = vi.fn(async (_url, init) => {
      const body = JSON.parse(String(init?.body ?? '{}'));
      calls.push(body);
      const data = body.query.includes('ListLinearIssueComments')
        ? { issue: { comments: { nodes: existing } } }
        : { commentCreate: { success: true, comment: { id: 'c-new' } } };
      return new Response(JSON.stringify({ data }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });
    return { calls, fetchImpl };
  }

  it('does nothing unless a red run reopened a resolved issue', async () => {
    const { calls, fetchImpl } = fakeLinear([]);
    for (const result of [
      { ok: true, action: 'created', id: 'i1' },
      { ok: true, action: 'updated', reopened: false, id: 'i1' },
      { ok: false, reason: 'linear_5xx' },
    ]) {
      expect(
        await noteRecurrence(result, {
          fingerprint: 'workflow-x',
          apiKey: 'k',
          fetchImpl,
        })
      ).toEqual({ ok: true, action: 'none' });
    }
    expect(calls).toHaveLength(0);
  });

  it('counts recurrences and asks for a human from the third on', async () => {
    const prior = Array.from({ length: HUMAN_AFTER - 1 }, (_, i) => ({
      id: `c${i}`,
      body: `${RECURRENCE_MARKER}\nolder`,
      createdAt: null,
    }));
    const { calls, fetchImpl } = fakeLinear(prior);
    const out = await noteRecurrence(
      { ok: true, action: 'updated', reopened: true, id: 'i1' },
      {
        fingerprint: 'workflow-x',
        runUrl: 'https://example.test/run/1',
        apiKey: 'k',
        fetchImpl,
      }
    );
    expect(out).toEqual({
      ok: true,
      action: 'recurred',
      count: HUMAN_AFTER,
      needsHuman: true,
    });
    const posted = calls.find(c => c.query.includes('commentCreate'));
    expect(posted.variables.body).toContain(`recurrence ${HUMAN_AFTER}`);
    expect(posted.variables.body).toContain('needs a human look');
  });

  it('writes the first recurrence without the human line', () => {
    const text = recurrenceComment({ count: 1, fingerprint: 'workflow-x' });
    expect(recurrenceCount([{ body: text }])).toBe(1);
    expect(text).not.toContain('needs a human look');
  });
});
