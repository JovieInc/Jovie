import { describe, expect, it } from 'vitest';
import { buildFindingIssue, fileFinding } from '../bot-review-findings.mjs';
import {
  recoverBotFindings,
  resolveBotThreads,
} from '../bot-review-threads.mjs';
import {
  appBot,
  CODEX_P1,
  c,
  codex,
  fakeGh,
  fakeIntake,
  HEAD,
  human,
  liveRead,
  replies,
  resolves,
  thread,
} from './bot-review-fixtures.mjs';

// Done-check: a failed intake may resolve for advisory merge policy, but the
// original GitHub finding remains recoverable after merge, exactly once.
describe('durable advisory recovery', () => {
  it('recovers a failed intake from a resolved, replied thread on a merged newer head', async () => {
    const original = thread('durable', [c(codex, CODEX_P1)]);
    const linear = fakeIntake();
    const initial = fakeGh([original]);
    await resolveBotThreads({
      repo: 'JovieInc/Jovie',
      pr: 7,
      head: HEAD,
      gh: initial.gh,
      intake: {
        ...linear.intake,
        upsert: async () => ({ ok: false, reason: 'outage' }),
      },
      log: () => {},
    });
    expect(resolves(initial.calls)).toHaveLength(1);
    const recovered = {
      ...original,
      isResolved: true,
      comments: {
        ...original.comments,
        nodes: [...original.comments.nodes, c(appBot, 'Resolved')],
      },
    };
    const gh = async () => {
      const read = liveRead([recovered]);
      const body = JSON.parse(read.stdout);
      Object.assign(body.data.repository.pullRequest, {
        state: 'MERGED',
        headRefOid: 'b'.repeat(40),
      });
      return { code: 0, stdout: JSON.stringify(body) };
    };
    for (let i = 0; i < 2; i++)
      await recoverBotFindings({
        repo: 'JovieInc/Jovie',
        pr: 7,
        gh,
        intake: linear.intake,
        log: () => {},
      });
    expect(linear.issues.size).toBe(1);
    expect(linear.upserts).toHaveLength(2);
    expect(linear.upserts[0]).toMatchObject({
      preserveExisting: true,
      reopenTerminal: false,
    });
  });
});

describe('recovery safety and completeness', () => {
  it('records original commit, URL and stable evidence digest across newer heads', () => {
    const original = thread('evidence', [
      {
        ...c(codex, CODEX_P1),
        url: 'https://github.com/comment/1',
        originalCommit: { oid: HEAD },
      },
    ]);
    const one = buildFindingIssue({
      repo: 'r/n',
      pr: 7,
      head: HEAD,
      thread: original,
      severity: 'P1',
    });
    const two = buildFindingIssue({
      repo: 'r/n',
      pr: 7,
      head: 'b'.repeat(40),
      thread: original,
      severity: 'P1',
    });
    expect(one.evidenceMarker).toBe(two.evidenceMarker);
    expect(one.description).toContain(`Original comment commit: ${HEAD}`);
    expect(one.description).toContain('https://github.com/comment/1');
    original.comments.nodes[0].body += ' Additional evidence.';
    expect(
      buildFindingIssue({
        repo: 'r/n',
        pr: 7,
        head: HEAD,
        thread: original,
        severity: 'P1',
      }).evidenceMarker
    ).not.toBe(one.evidenceMarker);
  });

  it('does no GitHub writes when head changes during intake', async () => {
    const calls = [];
    let moved = false;
    const gh = async args => {
      calls.push(args);
      const response = liveRead([thread('race', [c(codex, CODEX_P1)])]);
      if (moved)
        response.stdout = response.stdout.replace(HEAD, 'b'.repeat(40));
      return response;
    };
    const linear = fakeIntake();
    const out = await resolveBotThreads({
      repo: 'r/n',
      pr: 7,
      head: HEAD,
      gh,
      intake: {
        ...linear.intake,
        upsert: async issue => {
          moved = true;
          return linear.intake.upsert(issue);
        },
      },
      log: () => {},
    });
    expect(out.skip).toBe('source-changed');
    expect(replies(calls)).toHaveLength(0);
    expect(resolves(calls)).toHaveLength(0);
  });

  it('reports bounded pagination and quota cooldown without hiding recovered originals', async () => {
    const response = liveRead([thread('partial', [c(codex, CODEX_P1)])]);
    const body = JSON.parse(response.stdout);
    body.data.repository.pullRequest.reviewThreads.pageInfo = {
      hasNextPage: true,
      endCursor: 'more',
    };
    response.stdout = JSON.stringify(body);
    const linear = fakeIntake();
    const out = await recoverBotFindings({
      repo: 'r/n',
      pr: 7,
      maxPages: 1,
      gh: async () => response,
      intake: {
        ...linear.intake,
        upsert: async () => ({
          ok: false,
          reason: 'linear_rate_limited',
          resetAt: 'tomorrow',
        }),
      },
      log: () => {},
    });
    expect(out.warnings.join(' ')).toContain('pagination-incomplete');
    expect(out.warnings.join(' ')).toContain('quota cooldown until tomorrow');
  });
});

it('protects a human reply arriving while intake was awaited', async () => {
  const current = thread('human-race', [c(codex, CODEX_P1)]);
  let called = 0;
  const gh = async () => {
    const response = JSON.parse(liveRead([current]).stdout);
    response.data.node = current;
    called++;
    return { code: 0, stdout: JSON.stringify(response) };
  };
  const linear = fakeIntake();
  const out = await resolveBotThreads({
    repo: 'r/n',
    pr: 7,
    head: HEAD,
    gh,
    intake: {
      ...linear.intake,
      upsert: async issue => {
        current.comments.nodes.push(c(human, 'Please explain this.'));
        return linear.intake.upsert(issue);
      },
    },
    log: () => {},
  });
  expect(out.skip).toBe('source-changed');
  expect(out.resolved).toEqual([]);
  expect(called).toBe(2);
});

it('recovers original comments across thread pages without requiring all reply pages', async () => {
  let reads = 0;
  const linear = fakeIntake();
  const gh = async args => {
    const current = thread(`page-${reads}`, [c(codex, CODEX_P1)]);
    current.comments.pageInfo.hasNextPage = true;
    const response = JSON.parse(liveRead([current]).stdout);
    response.data.repository.pullRequest.reviewThreads.pageInfo =
      reads++ === 0
        ? { hasNextPage: true, endCursor: 'next' }
        : { hasNextPage: false };
    if (reads === 2) expect(args).toContain('after=next');
    return { code: 0, stdout: JSON.stringify(response) };
  };
  const out = await recoverBotFindings({
    repo: 'r/n',
    pr: 7,
    gh,
    intake: linear.intake,
    log: () => {},
  });
  expect(out.filed).toHaveLength(2);
  expect(out.warnings).toEqual([]);
});

it('does not acknowledge an intake success without a recoverable issue identity', async () => {
  const linear = fakeIntake();
  expect(
    await fileFinding(
      { fingerprint: 'fp', title: 'finding' },
      {
        ...linear.intake,
        upsert: async () => ({ ok: true, action: 'created' }),
        log: () => {},
      }
    )
  ).toMatchObject({ ok: false, reason: 'linear_issue_identity_missing' });
});
