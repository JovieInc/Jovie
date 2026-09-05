import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  classifyQueueOwnership,
  countsAsRecoveryFailure,
  recoveryIssueSnapshot,
  run,
} from '../../ownerless-recovery-sweeper.mjs';
import {
  buildPrFleetClosureAudit,
  classifyRecoveryFiles,
  evaluateRecoveryCandidate,
  shouldDispatchOwnerlessRecovery,
} from '../ownerless-recovery-policy.mjs';

const head = 'a'.repeat(40);
const main = 'b'.repeat(40);
const now = '2026-08-15T02:00:00.000Z';
const fresh = '2026-08-15T01:59:30.000Z';
const pull = (number, extra = {}) => ({
  number,
  title: extra.title ?? `Fix JOV-${number}`,
  body: extra.body ?? `Fix JOV-${number}`,
  mergeable_state: extra.mergeable_state ?? 'clean',
  head: { sha: String(number).padStart(40, '0') },
  ...extra,
});
const issue = (identifier, state = 'Human Review', extra = {}) => ({
  identifier,
  state: { name: state },
  comments: [],
  attachments: [],
  ...extra,
});
const audit = (pullRequests, linearIssues, extra = {}) =>
  buildPrFleetClosureAudit({
    pullRequests,
    linearIssues,
    now: new Date(now),
    snapshot: { complete: true, startedAt: fresh, completedAt: now },
    ...extra,
  });

describe('ownerless recovery policy', () => {
  it('admits focused green recovery work after one ownerless hour', () => {
    expect(
      evaluateRecoveryCandidate({
        pr: {
          state: 'open',
          assignees: [],
          created_at: '2026-08-15T00:00:00.000Z',
          mergeable: true,
          base: { ref: 'main', repo: { full_name: 'JovieInc/Jovie' } },
          head: { sha: head, repo: { full_name: 'JovieInc/Jovie' } },
        },
        mainSha: main,
        compare: { behind_by: 0 },
        timeline: [],
        files: ['scripts/ci-merge-queue-check.mjs'],
        patch: '+const timeout = 9;',
        checksPassing: true,
        now: Date.parse(now),
      }).eligible
    ).toBe(true);
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

  it('keeps ownerless dispatch available unless the snapshot or Symphony is unsafe', () => {
    const ownerless = audit([pull(7, { title: 'Ownerless', body: '' })], [], {
      symphonyState: { observedAt: fresh, running: [] },
    });
    expect(ownerless.status).toBe('blocked');
    expect(shouldDispatchOwnerlessRecovery(ownerless)).toBe(true);
    expect(
      audit([pull(31)], [issue('JOV-31', 'Done')]).violations[0].reason
    ).toBe('terminal-linear-issue-open-pr');
    expect(
      shouldDispatchOwnerlessRecovery(
        audit([pull(50)], [issue('JOV-50')], {
          snapshot: { complete: false, startedAt: fresh, completedAt: now },
        })
      )
    ).toBe(false);
    expect(
      shouldDispatchOwnerlessRecovery(
        audit([pull(60)], [issue('JOV-60', 'In Progress')], {
          symphonyState: { running: ['JOV-60'] },
        })
      )
    ).toBe(false);
  });

  it('validates queue ownership and comment dedupe keys', () => {
    expect(
      classifyQueueOwnership({ headRefOid: head, queued: true }, head).outcome
    ).toBe('already-delegated-exact-head');
    expect(countsAsRecoveryFailure({ queued: false, pending: false })).toBe(
      true
    );
    expect(
      readFileSync(new URL('../upsert-pr-comment.sh', import.meta.url), 'utf8')
    ).toContain('${4:+:$4}');
  });
});

describe('tracker scan admission', () => {
  it('does not read Linear for empty or draft-only PR inventories', async () => {
    for (const open of [[], [{ draft: true }], [{ isDraft: true }]]) {
      expect(
        await recoveryIssueSnapshot(open, () => {
          throw new Error('unexpected tracker read');
        })
      ).toBeNull();
    }
  });
  it('returns from the actual sweep before tracker reads when all PRs are drafts', async () => {
    await run({
      resolvePolicyHead: async () => main,
      readOpenPulls: async base => {
        expect(base).toBe('main');
        return [{ draft: true }];
      },
      readIssueSnapshot: async () => {
        throw new Error('unexpected tracker read');
      },
    });
  });
  it('preserves exhaustive evidence and propagates unknown for real recovery demand', async () => {
    const snapshot = {
      issues: [],
      coverage: {
        complete: true,
        pages: 1,
        scanned: 0,
        hasNextPage: false,
        endCursor: null,
        reason: null,
      },
    };
    expect(
      await recoveryIssueSnapshot([{ draft: false }], async () => snapshot)
    ).toBe(snapshot);
    await expect(
      recoveryIssueSnapshot([{ draft: false }], async () => {
        throw new Error('quota exhausted');
      })
    ).rejects.toThrow('quota exhausted');
  });
  it('skips draft events before the workflow scans and wakes when a draft becomes ready', () => {
    const workflow = readFileSync(
      new URL(
        '../../../.github/workflows/ownerless-recovery-sweep.yml',
        import.meta.url
      ),
      'utf8'
    );
    expect(workflow).toMatch(
      /types: \[opened, reopened, unlabeled, ready_for_review\]/
    );
    expect(workflow).toMatch(
      /if: github.event_name != 'pull_request' \|\| github.event.pull_request.draft == false/
    );
  });
});
