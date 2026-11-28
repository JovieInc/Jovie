import { describe, expect, it } from 'vitest';
import {
  buildFindingIssue,
  escalationSeverity,
  FINDING_PRIORITY,
  fileFinding,
  findingSeverity,
  findingTitle,
} from '../bot-review-findings.mjs';
import { resolveBotThreads } from '../bot-review-threads.mjs';

import {
  appBot,
  CODEX_P1,
  CODEX_P2,
  c,
  codex,
  FOOTER,
  fakeGh,
  fakeIntake,
  HEAD,
  human,
  RABBIT_MAJOR,
  RABBIT_MINOR,
  replies,
  resolves,
  SEER_HIGH,
  SEER_MEDIUM,
  thread,
} from './bot-review-fixtures.mjs';

describe('bot review finding severity', () => {
  it('reads Codex, Greptile, Seer and CodeRabbit severity markers', () => {
    expect(findingSeverity(CODEX_P1)).toBe('P1');
    expect(findingSeverity(CODEX_P2)).toBe('P2');
    expect(findingSeverity('<a><img alt="P0"></a> **Boom**')).toBe('P0');
    expect(findingSeverity(SEER_HIGH)).toBe('P1');
    expect(findingSeverity(SEER_MEDIUM)).toBe('P2');
    expect(
      findingSeverity(SEER_HIGH.replace('Severity: HIGH', 'Severity: CRITICAL'))
    ).toBe('P0');
    expect(findingSeverity(RABBIT_MAJOR)).toBe('P1');
    expect(findingSeverity(RABBIT_MINOR)).toBe('P2');
    expect(
      findingSeverity('_⚠️ Potential issue_ | _🔴 Critical_\n\n**X**')
    ).toBe('P0');
    expect(findingSeverity('Looks fine, minor nit.')).toBeNull();
  });

  it('titles the finding without badges or markup', () => {
    expect(findingTitle(CODEX_P1)).toBe(
      'Restrict assurance stripping to receipt contexts'
    );
    expect(findingTitle(SEER_HIGH)).toBe(
      'Setup and compilation errors in `startup-budget.mjs` are caught without setting a non-zero exit code.'
    );
    expect(findingTitle(RABBIT_MAJOR)).toBe(
      'Revert detection mislabels follow-up PRs as reverts.'
    );
  });

  it('keeps original P0/P1 eligibility independent of replies or a resolved marker', () => {
    expect(escalationSeverity(thread('T', [c(codex, CODEX_P1)]))).toBe('P1');
    expect(escalationSeverity(thread('T', [c(codex, CODEX_P2)]))).toBeNull();
    expect(
      escalationSeverity(
        thread('T', [c(codex, CODEX_P1), c(human, `Fixed.${FOOTER}`)])
      )
    ).toBe('P1');
    expect(
      escalationSeverity(
        thread('T', [c(codex, `*Resolved in [\`abc\`](u)*\n\n${SEER_HIGH}`)])
      )
    ).toBe('P1');
  });

  it('builds a High fleet issue keyed by repo, PR and thread', () => {
    const issue = buildFindingIssue({
      repo: 'JovieInc/Jovie',
      pr: 7,
      head: HEAD,
      thread: thread('PRRT_1', [c(codex, CODEX_P1)]),
      severity: 'P1',
    });
    expect(issue.fingerprint).toBe('bot-review:JovieInc/Jovie#7:PRRT_1');
    expect(issue.title).toBe(
      'P1: Restrict assurance stripping to receipt contexts (bot-review:JovieInc/Jovie#7:PRRT_1)'
    );
    expect(issue.priority).toBe(FINDING_PRIORITY);
    expect(FINDING_PRIORITY).toBe(2);
    expect(issue.description).toContain(
      '- PR: https://github.com/JovieInc/Jovie/pull/7'
    );
    expect(issue.description).toContain('`scripts/lib/receipts.py:42`');
    // Quoted as data in a fence the body's own backticks cannot close.
    expect(issue.description).toContain(`\`\`\`text\n${CODEX_P1}\n\`\`\``);
  });

  it('dry-runs without a Linear key and logs the line it would file', async () => {
    const lines = [];
    let called = false;
    const out = await fileFinding(
      { title: 'P1: x (fp)', fingerprint: 'fp' },
      {
        apiKey: '',
        upsert: async () => {
          called = true;
        },
        log: line => lines.push(line),
        pr: 7,
      }
    );
    expect(out).toEqual({ ok: false, dryRun: true });
    expect(called).toBe(false);
    expect(lines[0]).toContain('dry-run would file Linear issue "P1: x (fp)"');
  });
});

describe('bot review threads filed before resolving', () => {
  const run = (gh, intake, extra = {}) =>
    resolveBotThreads({
      repo: 'JovieInc/Jovie',
      pr: 7,
      head: HEAD,
      gh,
      intake,
      log: () => {},
      ...extra,
    });

  it('files an unanswered P1 once, replies with the issue, resolves, and a rerun does not refile', async () => {
    const linear = fakeIntake();
    const first = fakeGh([thread('T1', [c(codex, CODEX_P1)])]);
    const out = await run(first.gh, linear.intake);
    expect(out).toEqual({
      resolved: ['T1'],
      failed: [],
      filed: ['JOV-90000'],
      skip: null,
    });
    expect(linear.upserts).toHaveLength(1);
    expect(linear.upserts[0].keepLabelIds).toEqual(['label-fleet']);
    expect(linear.upserts[0].priority).toBe(2);
    const [reply] = replies(first.calls);
    expect(reply).toContain('id=T1');
    expect(reply.find(a => a.startsWith('body='))).toContain(
      '[JOV-90000](https://linear.app/jovie/issue/JOV-90000)'
    );
    // Reply first, then the same resolve as today.
    expect(first.calls.indexOf(reply)).toBeLessThan(
      first.calls.indexOf(resolves(first.calls)[0])
    );

    // Rerun on the same head: the resolve did not stick, but the thread now
    // carries the resolver's reply, so it is answered and is not filed again.
    const reply_ = c(appBot, 'P1 finding ... filed as JOV-90000.');
    const second = fakeGh([thread('T1', [c(codex, CODEX_P1), reply_])]);
    const again = await run(second.gh, linear.intake);
    expect(again.resolved).toEqual(['T1']);
    expect(again.filed).toEqual(['JOV-90000']);
    expect(linear.upserts).toHaveLength(2);
    expect(replies(second.calls)).toHaveLength(0);
    // Once resolved, the thread is left alone entirely.
    const third = fakeGh([
      thread('T1', [c(codex, CODEX_P1), reply_], { isResolved: true }),
    ]);
    expect((await run(third.gh, linear.intake)).resolved).toEqual([]);
    expect(linear.upserts).toHaveLength(3);
  });

  it('resolves a P2 finding as today without filing or replying', async () => {
    const linear = fakeIntake();
    const { gh, calls } = fakeGh([thread('T2', [c(codex, CODEX_P2)])]);
    const out = await run(gh, linear.intake);
    expect(out.resolved).toEqual(['T2']);
    expect(linear.upserts).toHaveLength(0);
    expect(replies(calls)).toHaveLength(0);
    expect(calls).toHaveLength(3);
  });

  it('files replied findings while preserving human thread protection', async () => {
    const linear = fakeIntake();
    const { gh, calls } = fakeGh([
      thread('T3', [c(codex, CODEX_P1), c(human, `Fixed in abc.${FOOTER}`)]),
      thread('H', [c(codex, CODEX_P1), c(human, 'Is this real?')]),
    ]);
    const out = await run(gh, linear.intake);
    // The human-answered thread stays untouched, exactly as before.
    expect(out.resolved).toEqual(['T3']);
    expect(linear.upserts).toHaveLength(2);
    expect(replies(calls)).toHaveLength(1);
  });

  it('still resolves the thread when Linear filing fails or throws', async () => {
    for (const upsert of [
      async () => ({ ok: false, reason: 'linear_create_500' }),
      async () => {
        throw new Error('network down');
      },
    ]) {
      const lines = [];
      const { gh, calls } = fakeGh([thread('T4', [c(codex, SEER_HIGH)])]);
      const out = await run(
        gh,
        { ...fakeIntake().intake, upsert },
        { log: line => lines.push(line) }
      );
      expect(out).toEqual({
        resolved: ['T4'],
        failed: [],
        filed: [],
        skip: null,
      });
      expect(replies(calls)).toHaveLength(0);
      expect(resolves(calls)).toHaveLength(1);
      expect(
        lines.some(line => /Linear filing (failed|threw)/.test(line))
      ).toBe(true);
    }
  });

  it('CLI --dry-run files nothing and resolves nothing for a P1', async () => {
    const linear = fakeIntake();
    const { gh, calls } = fakeGh([thread('T5', [c(codex, CODEX_P1)])]);
    const out = await run(gh, linear.intake, { dryRun: true });
    expect(out.resolved).toEqual(['T5']);
    expect(linear.upserts).toHaveLength(0);
    expect(calls).toHaveLength(1);
  });
});
