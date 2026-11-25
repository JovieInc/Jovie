import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseArgs, parseRunList } from '../../merge-queue-cancel-causes.mjs';
import {
  aggregateVerdict,
  analyze,
  CANCEL_CAUSES,
  CHECK_RESPONSE_TIMEOUT_MINUTES,
  mergedPrsFromGitLog,
  parseQueueRef,
  toMarkdown,
} from '../merge-queue-cancel-causes.mjs';

const T0 = Date.UTC(2026, 10, 15, 0, 0, 0);
const at = min => new Date(T0 + min * 60_000).toISOString();
const sha = n => n.toString(16).padStart(40, '0');
const MAIN = sha(0xfff);
let nextId = 1;
// One merge_group run: PR `pr` layered on `base` (a head_sha or MAIN).
const run = (pr, head, base, conclusion, start, end, extra = {}) => ({
  id: nextId++,
  head_branch: `gh-readonly-queue/main/pr-${pr}-${base}`,
  head_sha: head,
  status: 'completed',
  conclusion,
  created_at: at(start),
  run_started_at: at(start),
  updated_at: at(end),
  run_attempt: 1,
  ...extra,
});
const mainRun = run(1, MAIN, sha(0xeee), 'success', -30, -20);
const causeOf = (report, id) => report.classified.find(c => c.id === id)?.cause;

describe('parseQueueRef', () => {
  it('reads PR number and base SHA from a native queue ref', () => {
    expect(
      parseQueueRef(`refs/heads/gh-readonly-queue/main/pr-26006-${sha(1)}`)
    ).toEqual({
      pr: 26006,
      baseSha: sha(1),
    });
    expect(parseQueueRef('gh-readonly-queue/main/pr-0-abc')).toBeNull();
    expect(parseQueueRef('main')).toBeNull();
  });
});

describe('cancel causes', () => {
  it('attributes groups behind a red ci.yml run to an ejection cascade, directly and through cancelled groups', () => {
    const a = run(10, sha(10), MAIN, 'failure', 0, 12);
    const b = run(11, sha(11), sha(10), 'cancelled', 1, 12.5);
    const c = run(12, sha(12), sha(11), 'cancelled', 2, 12.6);
    const report = analyze([
      mainRun,
      a,
      b,
      c,
      run(11, sha(21), MAIN, 'success', 13, 25),
    ]);
    expect(causeOf(report, b.id)).toBe('ejection_cascade');
    expect(causeOf(report, c.id)).toBe('ejection_cascade');
    expect(report.cancel_causes.ejection_cascade).toMatchObject({
      total: 2,
      direct: 1,
      transitive: 1,
    });
  });

  it('does not blame a failure ahead that finished after this group was already cancelled', () => {
    const a = run(10, sha(10), MAIN, 'failure', 0, 20);
    const b = run(11, sha(11), sha(10), 'cancelled', 1, 5);
    const later = run(11, sha(31), MAIN, 'success', 6, 16);
    const report = analyze([mainRun, a, b, later]);
    expect(causeOf(report, b.id)).toBe('supersession');
  });

  it('folds other required workflows: a red PR Size Guard on the group itself or a group ahead is an other-workflow eject', () => {
    const a = run(10, sha(10), MAIN, 'cancelled', 0, 2);
    const b = run(11, sha(11), sha(10), 'cancelled', 0.5, 2.2);
    const psg = [
      {
        id: 900,
        head_sha: sha(10),
        status: 'completed',
        conclusion: 'failure',
        updated_at: at(1.5),
      },
    ];
    const report = analyze(
      [mainRun, a, b, run(11, sha(41), MAIN, 'success', 3, 14)],
      {
        otherWorkflows: { 'PR Size Guard': psg },
      }
    );
    expect(causeOf(report, a.id)).toBe('other_workflow_eject');
    expect(causeOf(report, b.id)).toBe('other_workflow_eject');
    expect(report.cancel_causes.other_workflow_eject).toMatchObject({
      direct: 1,
      transitive: 1,
    });
    expect(report.other_workflow_eject_by_workflow).toEqual({
      'PR Size Guard': 2,
    });
    // Without the other workflow's runs (v1 gap) the same cancels read as supersession.
    const v1 = analyze([
      mainRun,
      a,
      b,
      run(11, sha(41), MAIN, 'success', 3, 14),
    ]);
    expect(causeOf(v1, a.id)).toBe('dequeue');
    expect(causeOf(v1, b.id)).toBe('dequeue');
  });

  it('separates a timeout eject, supersession, a final dequeue, a duplicate head and an unknown base', () => {
    const timedOut = run(
      20,
      sha(20),
      MAIN,
      'cancelled',
      0,
      CHECK_RESPONSE_TIMEOUT_MINUTES
    );
    const superseded = run(21, sha(21), MAIN, 'cancelled', 0, 5);
    const rebuilt = run(21, sha(22), MAIN, 'success', 6, 16);
    const gone = run(23, sha(23), MAIN, 'cancelled', 0, 4);
    const dupOld = run(24, sha(24), MAIN, 'cancelled', 0, 3);
    const dupNew = run(24, sha(24), MAIN, 'success', 2, 12);
    const orphan = run(25, sha(25), sha(0xabc), 'cancelled', 0, 3);
    const report = analyze([
      mainRun,
      timedOut,
      superseded,
      rebuilt,
      gone,
      dupOld,
      dupNew,
      orphan,
    ]);
    expect(causeOf(report, timedOut.id)).toBe('timeout_eject');
    expect(causeOf(report, superseded.id)).toBe('supersession');
    expect(causeOf(report, gone.id)).toBe('dequeue');
    expect(causeOf(report, dupOld.id)).toBe('concurrency_duplicate_head');
    expect(causeOf(report, orphan.id)).toBe('unknown_base');
  });

  it('counts every cancelled run exactly once and is independent of input order', () => {
    const runs = [
      mainRun,
      run(30, sha(30), MAIN, 'failure', 0, 8),
      run(31, sha(31), sha(30), 'cancelled', 1, 8.5),
      run(32, sha(32), sha(31), 'cancelled', 2, 8.6),
      run(31, sha(33), MAIN, 'success', 9, 19),
    ];
    const a = analyze(runs);
    const b = analyze([...runs].reverse());
    expect(b).toEqual(a);
    const total = CANCEL_CAUSES.reduce(
      (n, c) => n + a.cancel_causes[c].total,
      0
    );
    expect(total).toBe(a.counts.cancelled);
  });
});

describe('rates', () => {
  it('publishes red A, decided red B and the cancel rate with cancels excluded from B', () => {
    const runs = [];
    let prev = MAIN;
    const push = (conclusion, n) => {
      for (let i = 0; i < n; i++) {
        const head = sha(10_000 + runs.length);
        runs.push(
          run(
            5000 + runs.length,
            head,
            prev,
            conclusion,
            runs.length,
            runs.length + 1
          )
        );
        prev = head;
      }
    };
    push('success', 473);
    push('failure', 372);
    push('cancelled', 730);
    const r = analyze(runs).rates;
    expect(r).toEqual({
      red_a_failure_over_completed_pct: 23.6,
      red_b_decided_pct: 44,
      cancel_rate_pct: 46.3,
    });
  });

  it('splits failures by what ran directly ahead and keeps the 30-minute timeout metric', () => {
    const a = run(40, sha(40), MAIN, 'failure', 0, 10);
    const b = run(41, sha(41), sha(40), 'failure', 1, 35);
    const report = analyze([mainRun, a, b]);
    expect(report.failures_by_ahead.independent.n).toBe(1);
    expect(report.failures_by_ahead.failed_ahead.n).toBe(1);
    expect(report.timeout_metric).toMatchObject({
      check_response_timeout_minutes: 30,
      decided_runs_at_or_over_timeout: 1,
    });
  });

  it('joins merged PRs from the main git log and filters by window', () => {
    const merged = mergedPrsFromGitLog(
      `${sha(1)} 2026-11-15T00:10:00Z feat: x (#50)\n${sha(2)} 2026-11-15 chore: no pr`
    );
    expect([...merged]).toEqual([50]);
    const inside = run(50, sha(50), MAIN, 'success', 0, 10);
    const outside = run(51, sha(51), MAIN, 'success', 600, 610);
    const report = analyze([mainRun, inside, outside], {
      mergedPrs: merged,
      window: { since: at(-1), until: at(60) },
    });
    expect(report.runs).toBe(1);
    expect(report.queue).toEqual({
      prs_with_runs: 1,
      merged_prs_with_runs: 1,
      runs_per_merged_pr: 1,
    });
    expect(toMarkdown(report)).toContain('Red B (decided)');
  });
});

describe('aggregateVerdict', () => {
  const done = conclusion => ({ status: 'completed', conclusion });
  it('fails closed: failure beats cancelled beats pending beats success; unknown conclusions fail', () => {
    const names = ['CI', 'PR Size Guard', 'Company guards'];
    expect(
      aggregateVerdict(
        {
          CI: done('success'),
          'PR Size Guard': done('success'),
          'Company guards': done('skipped'),
        },
        names
      )
    ).toEqual({ verdict: 'success', deciders: [] });
    expect(
      aggregateVerdict(
        { CI: done('cancelled'), 'PR Size Guard': done('failure') },
        names
      )
    ).toEqual({ verdict: 'failure', deciders: ['PR Size Guard'] });
    expect(
      aggregateVerdict(
        { CI: done('success'), 'PR Size Guard': done('success') },
        names
      ).verdict
    ).toBe('pending');
    expect(
      aggregateVerdict({ CI: done('startup_failure') }, ['CI']).verdict
    ).toBe('failure');
    expect(aggregateVerdict({ CI: done('timed_out') }, ['CI']).verdict).toBe(
      'failure'
    );
  });
});

describe('CLI', () => {
  it('parses concatenated list responses and JSON lines, latest attempt wins', () => {
    const r1 = { id: 1, head_sha: 'a', run_attempt: 1, conclusion: 'failure' };
    const r1b = { ...r1, run_attempt: 2, conclusion: 'success' };
    const text = `${JSON.stringify({ workflow_runs: [r1] })}\n${JSON.stringify({ workflow_runs: [] })}\n${JSON.stringify(r1b)}\n`;
    expect(parseRunList(text)).toEqual([r1b]);
    expect(() => parseRunList('{"nope": 1}')).toThrow(/not a run/);
  });

  it('rejects incomplete arguments', () => {
    expect(() => parseArgs([])).toThrow(/--ci-runs/);
    expect(() => parseArgs(['--ci-runs', 'x', '--since', 'a'])).toThrow(
      /together/
    );
    expect(() => parseArgs(['--ci-runs', 'x', '--other', 'bad'])).toThrow(
      /Workflow name=path/
    );
  });

  it('runs offline end to end on saved files', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mq-cancel-'));
    try {
      const a = run(60, sha(60), MAIN, 'failure', 0, 10);
      const b = run(61, sha(61), sha(60), 'cancelled', 1, 10.5);
      writeFileSync(
        join(dir, 'ci.json'),
        JSON.stringify({ workflow_runs: [mainRun, a, b] })
      );
      writeFileSync(join(dir, 'psg.json'), '[]');
      const out = execFileSync(
        process.execPath,
        [
          fileURLToPath(
            new URL('../../merge-queue-cancel-causes.mjs', import.meta.url)
          ),
          '--ci-runs',
          join(dir, 'ci.json'),
          '--other',
          `PR Size Guard=${join(dir, 'psg.json')}`,
          '--format',
          'json',
        ],
        { encoding: 'utf8' }
      );
      const report = JSON.parse(out);
      expect(report.cancel_causes.ejection_cascade.total).toBe(1);
      expect(report.other_workflows_measured).toEqual(['PR Size Guard']);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
