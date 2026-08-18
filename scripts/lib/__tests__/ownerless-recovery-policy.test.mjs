import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  classifyQueueOwnership,
  dispatchRecoveryIntent,
  resolveExactMainPolicyHead,
} from '../../ownerless-recovery-sweeper.mjs';
import {
  classifyRecoveryFiles,
  evaluateRecoveryCandidate,
} from '../ownerless-recovery-policy.mjs';

const head = 'a'.repeat(40);
const main = 'b'.repeat(40);
const repoRoot = fileURLToPath(new URL('../../..', import.meta.url));
const created = '2026-08-15T00:00:00.000Z';
const pr = {
  state: 'open',
  assignees: [],
  created_at: created,
  mergeable: true,
  base: { ref: 'main', repo: { full_name: 'JovieInc/Jovie' } },
  head: { sha: head, repo: { full_name: 'JovieInc/Jovie' } },
};

function evaluate(overrides = {}) {
  return evaluateRecoveryCandidate({
    pr: { ...pr, ...overrides },
    mainSha: main,
    compare: { behind_by: 0 },
    timeline: [],
    files: ['scripts/ci-merge-queue-check.mjs'],
    patch: '+const timeout = 9;',
    checksPassing: true,
    now: Date.parse('2026-08-15T02:00:00.000Z'),
  });
}

function promotionHarness(overrides = {}) {
  const receipts = [];
  const dispatches = [];
  const prCommands = [];
  const livePr = { ...pr, draft: false };
  let queueReads = 0;
  let liveReads = 0;
  const dependencies = {
    apiJsonImpl: async () => {
      liveReads += 1;
      return overrides.livePrAt?.(liveReads) ?? livePr;
    },
    candidateEvidenceImpl: async () => ({
      pr: livePr,
      timeline: [],
      files: ['scripts/ci-merge-queue-check.mjs'],
      patch: '+const timeout = 9;',
      patchComplete: true,
      containsOpenPrHead: false,
      compare: { behind_by: 0 },
    }),
    checksAreGreenImpl: async () => overrides.checksGreen ?? true,
    dispatchExactAdmissionImpl: async (number, expectedHead, mainSha) => {
      dispatches.push({ number, expectedHead, mainSha });
      if (overrides.dispatchError) throw overrides.dispatchError;
    },
    evaluateRecoveryCandidateImpl: input => ({
      eligible: input.pr.head.sha === head && input.checksPassing,
      ownerlessSince: created,
      lanes: ['ci'],
    }),
    mainHeadImpl: async () => overrides.liveMain ?? main,
    nowImpl: () => '2026-08-15T02:00:00.000Z',
    openStackHeadShasImpl: async () => [],
    pagesImpl: async () => [],
    prCommandImpl: async (...args) => {
      prCommands.push(args);
    },
    readPullRequestQueueStateImpl: async () => {
      queueReads += 1;
      return (
        overrides.queueStateAt?.(queueReads) ?? {
          headRefOid: head,
          queued: false,
          autoMergeEnabled: false,
        }
      );
    },
    upsertReceiptImpl: async (_number, _body, dedupeKey) => {
      receipts.push(dedupeKey);
    },
  };
  const evidence = {
    pr: livePr,
    timeline: [],
    files: ['scripts/ci-merge-queue-check.mjs'],
    patch: '+const timeout = 9;',
    patchComplete: true,
    containsOpenPrHead: false,
    compare: { behind_by: 0 },
  };
  return {
    dependencies,
    dispatches,
    prCommands,
    receipts,
    run: () =>
      dispatchRecoveryIntent(
        { number: 16060 },
        main,
        evidence,
        { eligible: true, lanes: ['ci'] },
        dependencies
      ),
  };
}

describe('ownerless recovery policy', () => {
  it('admits focused green recovery work after one ownerless hour', () => {
    expect(evaluate().eligible).toBe(true);
  });

  it('allows only non-worsening workflow tuning', () => {
    const classify = patch =>
      classifyRecoveryFiles(['.github/workflows/ci.yml'], patch).eligible;
    expect(
      classify('+run: node -e "process.mainModule.require(`child_process`)"')
    ).toBe(false);
    expect(classify('-timeout-minutes: 10\n+timeout-minutes: 9')).toBe(true);
    expect(classify('-max-parallel: 2\n+max-parallel: 999999')).toBe(false);
  });

  it('preserves queue and human policy holds for their owning controller', () => {
    for (const name of [
      'queue-deferred',
      'no-auto',
      'needs-human-review',
      'needs-manual-rebase',
    ]) {
      expect(evaluate({ labels: [{ name }] })).toMatchObject({
        eligible: false,
        reason: `held:${name}`,
      });
    }
  });

  it.each([
    'needs-human-taste',
    'needs:taste',
    'taste',
  ])('keeps advisory taste label %s eligible for recovery', name => {
    expect(evaluate({ labels: [{ name }] })).toMatchObject({
      eligible: true,
      reason: 'focused-recovery',
    });
  });

  it('delegates exact-head intent to Auto-Enroll instead of writing the native queue', () => {
    const sweeper = readFileSync(
      `${repoRoot}/scripts/ownerless-recovery-sweeper.mjs`,
      'utf8'
    );
    const controller = readFileSync(
      `${repoRoot}/.github/workflows/merge-queue-autoenroll.yml`,
      'utf8'
    );

    expect(sweeper).toContain('ownerless-recovery-admission');
    expect(sweeper).toContain('client_payload[main_sha]=${mainSha}');
    expect(sweeper).toContain(
      'client_payload[ownerless_since]=${ownerlessSince}'
    );
    expect(sweeper).toContain(
      'BOT_COMMENT_TRUSTED_AUTHORS_JSON: \'["jovie-bot[bot]"]\''
    );
    expect(sweeper).not.toContain("'--auto'");
    expect(sweeper).not.toContain("'--disable-auto'");
    expect(controller).toContain('types: [ownerless-recovery-admission]');
    expect(controller).toContain('group: merge-queue-drain-mutex');
  });

  it('requires the checked-out sweeper policy to equal live main', async () => {
    const sweeper = readFileSync(
      `${repoRoot}/scripts/ownerless-recovery-sweeper.mjs`,
      'utf8'
    );

    expect(sweeper).toContain(
      'const mainSha = await resolveExactMainPolicyHead();'
    );
    await expect(
      resolveExactMainPolicyHead({
        policyHeadImpl: async () => main,
        mainHeadImpl: async () => main,
      })
    ).resolves.toBe(main);
    await expect(
      resolveExactMainPolicyHead({
        policyHeadImpl: async () => head,
        mainHeadImpl: async () => main,
      })
    ).rejects.toThrow(`policy head ${head} is not live main ${main}`);
  });

  it('does not redispatch an exact head already owned by the native queue', () => {
    const queued = {
      headRefOid: head,
      queued: true,
      autoMergeEnabled: true,
    };
    expect(classifyQueueOwnership(queued, head)).toEqual({
      action: 'no_dispatch',
      outcome: 'already-delegated-exact-head',
    });
    expect(classifyQueueOwnership(queued, head)).toEqual({
      action: 'no_dispatch',
      outcome: 'already-delegated-exact-head',
    });
  });

  it('refuses foreign auto-merge or changed-head ownership', () => {
    expect(
      classifyQueueOwnership(
        { headRefOid: head, queued: false, autoMergeEnabled: true },
        head
      )
    ).toEqual({ action: 'fail', outcome: 'foreign-auto-merge-hold' });
    expect(
      classifyQueueOwnership(
        {
          headRefOid: 'c'.repeat(40),
          queued: false,
          autoMergeEnabled: false,
        },
        head
      )
    ).toEqual({ action: 'fail', outcome: 'queue-ownership-head-mismatch' });
  });

  it('dispatches one exact-head intent and is idempotent once the queue owns it', async () => {
    const harness = promotionHarness({
      queueStateAt: read => ({
        headRefOid: head,
        queued: read > 1,
        autoMergeEnabled: read > 1,
      }),
    });

    await expect(harness.run()).resolves.toEqual({
      queued: false,
      pending: true,
    });
    await expect(harness.run()).resolves.toEqual({
      queued: true,
      pending: false,
    });
    expect(harness.dispatches).toEqual([
      { number: 16060, expectedHead: head, mainSha: main },
    ]);
    expect(harness.receipts).toEqual([
      `${head}-attempting`,
      `${head}-delegated-exact-head-admission`,
      `${head}-already-delegated-exact-head`,
    ]);
  });

  it('does not dispatch when main, checks, or queue ownership changed', async () => {
    const changedMain = promotionHarness({ liveMain: 'c'.repeat(40) });
    await expect(changedMain.run()).resolves.toEqual({ queued: false });
    expect(changedMain.dispatches).toEqual([]);

    const redChecks = promotionHarness({ checksGreen: false });
    await expect(redChecks.run()).resolves.toEqual({ queued: false });
    expect(redChecks.dispatches).toEqual([]);

    const foreignAuto = promotionHarness({
      queueStateAt: () => ({
        headRefOid: head,
        queued: false,
        autoMergeEnabled: true,
      }),
    });
    await expect(foreignAuto.run()).resolves.toEqual({
      queued: false,
      pending: false,
    });
    expect(foreignAuto.dispatches).toEqual([]);
    expect(foreignAuto.receipts).toEqual([`${head}-foreign-auto-merge-hold`]);
  });

  it('records dispatch failure and restores a promoted draft after drift', async () => {
    const dispatchFailure = promotionHarness({
      dispatchError: new Error('dispatch unavailable'),
    });
    await expect(dispatchFailure.run()).rejects.toThrow('dispatch unavailable');
    expect(dispatchFailure.receipts.at(-1)).toBe(
      `${head}-dispatch-failed-compensated`
    );

    const draft = { ...pr, draft: true };
    const draftDrift = promotionHarness({
      livePrAt: read =>
        read === 1
          ? draft
          : {
              ...draft,
              draft: false,
              head: { ...pr.head, sha: 'd'.repeat(40) },
            },
    });
    await expect(draftDrift.run()).resolves.toEqual({ queued: false });
    expect(draftDrift.dispatches).toEqual([]);
    expect(draftDrift.prCommands).toEqual([
      ['ready', 16060],
      ['ready', 16060, '--undo'],
    ]);
    expect(draftDrift.receipts.at(-1)).toBe(`${head}-promotion-compensated`);
  });
});
