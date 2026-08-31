import { describe, expect, it } from 'vitest';
// biome-ignore format: compact fleet-only imports for the PR size guard.
import { classifyQueueOwnership, countsAsRecoveryFailure, processFleetClosureRemediationIntents, resolveExactMainPolicyHead } from '../../ownerless-recovery-sweeper.mjs';
import {
  buildPrFleetClosureAudit,
  classifyRecoveryFiles,
  evaluateRecoveryCandidate,
} from '../ownerless-recovery-policy.mjs';

const head = 'a'.repeat(40);
const main = 'b'.repeat(40);
const created = '2026-08-15T00:00:00.000Z';
const now = '2026-08-15T02:00:00.000Z';
const fresh = '2026-08-15T01:59:30.000Z';
const pr = {
  state: 'open',
  assignees: [],
  created_at: created,
  mergeable: true,
  base: { ref: 'main', repo: { full_name: 'JovieInc/Jovie' } },
  head: { sha: head, repo: { full_name: 'JovieInc/Jovie' } },
};

function evaluate() {
  return evaluateRecoveryCandidate({
    pr,
    mainSha: 'b'.repeat(40),
    compare: { behind_by: 0 },
    timeline: [],
    files: ['scripts/ci-merge-queue-check.mjs'],
    patch: '+const timeout = 9;',
    checksPassing: true,
    now: Date.parse('2026-08-15T02:00:00.000Z'),
  });
}

// biome-ignore format: compact fleet fixture helpers for the PR size guard.
const pull = (number, overrides = {}) => ({ number, title: `Fix JOV-${number}`, body: `Fix JOV-${number}`, mergeable_state: 'clean', head: { sha: String(number).padStart(40, '0') }, ...overrides });
// biome-ignore format: compact fleet fixture helpers for the PR size guard.
const issue = (identifier, state = 'Human Review', overrides = {}) => ({ identifier, state: { name: state }, comments: [], attachments: [], ...overrides });
// biome-ignore format: compact fleet fixture helpers for the PR size guard.
const audit = (pullRequests, linearIssues, overrides = {}) => buildPrFleetClosureAudit({ pullRequests, linearIssues, now: new Date(now), snapshot: { complete: true, startedAt: fresh, completedAt: now }, ...overrides });
// biome-ignore format: compact fleet fixture helpers for the PR size guard.
const keys = receipt => receipt.violations.map(item => `${item.pr}:${item.reason}:${item.action}`), sup = (owner, replacements, status = 'superseded') => `<!-- jovie-supersession:v1 status=${status} replacements=${replacements} owner=${owner} -->`;

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

  // biome-ignore format: compact deliberate-red fleet closure matrix for the PR size guard.
  it('audits canonical ownership separately from display buckets', () => {
    const mixed = audit([pull(1, { draft: true }), pull(2, { body: '<!-- linear-issue-identifier:JOV-2 -->' }), pull(3, { title: 'Attached only', body: '', mergeQueueEntry: { id: 'q' } }), pull(4, { title: 'Packet only', body: '' }), pull(5, { labels: [{ name: 'no-auto' }] }), pull(6, { mergeable_state: 'dirty' }), pull(7, { title: 'Ownerless', body: '', assignees: [{ login: 'octo' }] }), pull(8, { labels: [{ name: 'superseded' }] }), pull(9, { title: 'Packet sibling', body: '' })], [...[1, 2, 5, 6, 8].map(number => issue(`JOV-${number}`)), issue('JOV-3', 'Human Review', { attachments: [{ url: 'https://github.com/JovieInc/Jovie/pull/3' }] }), issue('JOV-5610', 'In Progress')], { prPacketMap: { 4: 'JOV-5610', 9: 'JOV-5610' }, symphonyState: { observedAt: fresh, running: ['JOV-5610'] } });
    const mixedByPr = new Map(mixed.items.map(item => [item.pr, item])); expect(mixed.items.map(item => item.category).join('|')).toBe('draft|ready/green|native queue|remediating|blocked|conflict/unstable|ownerless/stalled|superseded|remediating'); expect(mixedByPr.get(3).provenance.sources).toEqual(['exact-pr-attachment']); expect(mixedByPr.get(4).issue).toBe('JOV-5610');
    const owned = Array.from({ length: 101 }, (_, index) => pull(1000 + index));
    const ownerless = audit([...owned, pull(2001, { title: 'Ownerless draft', body: '', draft: true }), pull(2002, { title: 'Ownerless conflict', body: '', mergeable_state: 'dirty' })], owned.map(item => issue(`JOV-${item.number}`)));
    expect(ownerless.ownershipCounts['ownerless/stalled']).toBe(2); expect(keys(ownerless)).toEqual(expect.arrayContaining(['2001:missing-linear-provenance:operator-owned-exception', '2002:missing-linear-provenance:operator-owned-exception']));
    const stale = audit([pull(70, { draft: true }), pull(71, { labels: [{ name: 'no-auto' }] }), pull(72, { mergeQueueEntry: { id: 'mq' } })], ['JOV-70', 'JOV-71', 'JOV-72'].map(id => issue(id, 'In Progress')), { symphonyState: { observedAt: fresh, running: [], retrying: [] } });
    expect(stale.remediationIntents.map(item => `${item.pr}:${item.issue}`)).toEqual(['70:JOV-70']); expect(keys(stale)).toEqual(expect.arrayContaining(['71:in-progress-without-live-symphony-lease:preserve-hard-stop-owner', '72:in-progress-without-live-symphony-lease:preserve-native-queue-owner']));
    expect(keys(audit([pull(30), pull(31)], [issue('JOV-30', 'In Progress'), issue('JOV-31', 'Done')]))).toEqual(expect.arrayContaining(['30:in-progress-without-live-symphony-lease:emit-linear-remediation-intent', '31:terminal-linear-issue-open-pr:emit-linear-remediation-intent'])); expect(keys(audit([pull(50)], [issue('JOV-50')], { snapshot: { complete: false, startedAt: fresh, completedAt: now } }))).toEqual(expect.arrayContaining(['undefined:github-pagination-truncated:retry-stable-snapshot'])); expect(keys(audit([pull(51, { created_at: fresh })], [issue('JOV-51')]))).toEqual(expect.arrayContaining(['51:github-pr-created-during-pagination:retry-stable-snapshot'])); expect([{ observedAt: '2026-08-15T01:00:00.000Z', running: ['JOV-60'] }, { running: ['JOV-60'] }].map(symphonyState => audit([pull(60)], [issue('JOV-60', 'In Progress')], { symphonyState }).violations[0].reason)).toEqual(['symphony-state-stale', 'symphony-state-malformed']);
  });

  // biome-ignore format: compact supersession, queue, and Linear readback matrix for the PR size guard.
  it('validates supersession markers, queue ownership, and durable remediation', async () => {
    const valid = audit([pull(16871, { body: sup('JOV-5029', '16873,16875') }), pull(16873), pull(16875), pull(82, { labels: [{ name: 'no-auto' }] })], ['JOV-5029', 'JOV-16873', 'JOV-16875', 'JOV-82'].map(id => issue(id)));
    expect(new Map(valid.items.map(item => [item.pr, item])).get(16871)).toMatchObject({ category: 'superseded', issue: 'JOV-5029', ownership: { status: 'accountable' }, supersession: { status: 'valid', replacements: [16873, 16875] } });
    const invalid = audit([pull(90, { body: sup('JOV-90', '9999') }), pull(91, { body: '<!-- jovie-supersession:v1 replacements=92 owner=JOV-91 -->' }), pull(92, { body: sup('JOV-92', '93') }), pull(93, { body: sup('JOV-93', '92') })], ['JOV-90', 'JOV-91', 'JOV-92', 'JOV-93'].map(id => issue(id)));
    expect(keys(invalid)).toEqual(expect.arrayContaining(['90:supersession-replacement-missing-open-pr:operator-owned-exception', '91:supersession-status-invalid:operator-owned-exception', '92:supersession-cycle:operator-owned-exception', '93:supersession-cycle:operator-owned-exception']));
    expect([classifyQueueOwnership({ headRefOid: head, queued: true, autoMergeEnabled: true }, head).outcome, classifyQueueOwnership({ headRefOid: head, queued: false, autoMergeEnabled: true }, head).outcome, classifyQueueOwnership({ headRefOid: 'c'.repeat(40) }, head).outcome]).toEqual(['already-delegated-exact-head', 'foreign-auto-merge-hold', 'queue-ownership-head-mismatch']);
    expect([{ queued: false }, { queued: false, pending: true }, { queued: true, pending: false }, { queued: false, pending: false }].map(countsAsRecoveryFailure)).toEqual([false, false, false, true]);
    await expect(resolveExactMainPolicyHead({ policyHeadImpl: async () => main, mainHeadImpl: async () => main })).resolves.toBe(main);
    await expect(resolveExactMainPolicyHead({ policyHeadImpl: async () => head, mainHeadImpl: async () => main })).rejects.toThrow(`policy head ${head} is not live main ${main}`);
    const intent = { pr: 80, head, issue: 'JOV-80', displayCategory: 'draft', reason: 'in-progress-without-live-symphony-lease', action: 'reattach-remediation-lane' };
    const bare = issue('JOV-80', 'In Progress', { id: 'issue-80' }); const calls = {}; let current = bare; let reads = 0;
    const client = { fetchIssue: async () => current, addComment: async (_id, body) => ((current = { ...current, comments: [{ body }] }), { commentCreate: { success: true } }), transitionIssue: async (id, stateId) => ((calls.transition = { id, stateId }), (current = { ...current, state: { id: stateId, name: 'Todo' } }), { issueUpdate: { success: true } }) };
    const run = (clientImpl, fetchOfficialSymphonyStateImpl) => processFleetClosureRemediationIntents({ remediationIntents: [intent] }, { clientImpl, fetchOfficialSymphonyStateImpl, nowImpl: () => now, symphonyReadbackAttempts: 1 });
    expect((await run(client, async () => ({ observedAt: fresh, running: reads++ > 0 ? ['JOV-80'] : [] }))).results[0].status).toBe('reattached'); expect(calls.transition).toEqual({ id: 'issue-80', stateId: expect.any(String) }); expect((await run(client, async () => ({ observedAt: fresh, running: ['JOV-80'] }))).results[0].status).toBe('idempotent'); expect(await run(client, async () => ({ observedAt: '2026-08-15T01:00:00.000Z', running: ['JOV-80'] }))).toMatchObject({ ok: false, results: [expect.objectContaining({ reason: 'symphony-state-stale' })] });
    let failedIssue = bare; expect(await run({ fetchIssue: async () => failedIssue, addComment: async (_id, body) => ((failedIssue = { ...failedIssue, comments: [{ body }] }), { commentCreate: { success: true } }), transitionIssue: async () => ({ issueUpdate: { success: false } }) }, async () => ({ observedAt: fresh, running: [] }))).toMatchObject({ ok: false, results: [expect.objectContaining({ reason: 'linear-transition-failed' })] });
  });
});
