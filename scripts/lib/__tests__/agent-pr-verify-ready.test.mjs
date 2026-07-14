// biome-ignore-all format: keep the security regression suite within the PR size guard.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { assertReadyState, assertRedraftEligibility, buildTrustedEvidenceMarkdown, classifyAgentPr, isAgentBranch } from '../agent-pr-ready-policy.mjs';

const root = resolve(import.meta.dirname, '../../..');
const { load } = createRequire(resolve(root, 'node_modules/.pnpm/node_modules/resolver.cjs'))('js-yaml');
const policy = resolve(root, 'scripts/lib/agent-pr-ready-policy.mjs');
const workflowSource = readFileSync(resolve(root, '.github/workflows/agent-pr-verify-ready.yml'), 'utf8');
const workflow = load(workflowSource);
const tempDirs = new Set();
afterEach(() => { for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true }); tempDirs.clear(); });

const repository = 'JovieInc/Jovie', head = 'a'.repeat(40);
const live = { repository, expectedHeadSha: head }, trustedTrigger = { actor: 'itstimwhite', login: 'itstimwhite', association: 'MEMBER' };
const commonArgs = ['--repository', repository, '--expected-head-sha', head];
const artifact = `<!-- agent-run-artifact
${JSON.stringify({
  id: 'test', source: 'github', sourceRunId: head, kind: 'qa', status: 'done',
  title: 'Evidence', summary: 'Passed.', modelRoute: 'deterministic', allowedActions: ['read'], forbiddenActions: ['merge'], humanApprovalRequired: false,
  humanGate: { required: false, status: 'not_required', reason: null, reviewer: null, reviewedAt: null },
  linearIssueId: 'JOV-2510', linearIssueUrl: 'https://linear.app/jovie/issue/JOV-2510/test', pullRequestUrl: 'https://github.com/JovieInc/Jovie/pull/1', adminSurface: '/admin/ops',
  verificationGates: ['gstack.qa.exhaustive', 'gstack.review', 'gstack.ship'].map(name => ({ name, required: true, status: 'passed', evidenceUrl: null, summary: 'passed', checkedAt: '2026-07-14T00:00:00.000Z' })),
  costEstimate: { usd: 0, route: 'deterministic', inputTokens: 0, outputTokens: 0, notes: null },
  blockedReason: null, createdAt: '2026-07-14T00:00:00.000Z', updatedAt: '2026-07-14T00:00:00.000Z', metadata: {},
})}
-->`;

function pr(overrides = {}) {
  return {
    author_association: 'MEMBER', body: '', draft: true,
    base: { ref: 'main', repo: { full_name: repository } },
    head: { ref: 'codex/JOV-2510', repo: { full_name: repository }, sha: head },
    labels: [], user: { login: 'itstimwhite' }, ...overrides,
  };
}

function comment(login = 'itstimwhite', association = 'MEMBER') { return { author_association: association, body: artifact, user: { login } }; }
function evidence(options = {}) { return buildTrustedEvidenceMarkdown({ pr: pr(), ...live, ...options }); }

function run(args, env = {}) { return spawnSync(process.execPath, [policy, ...args], { encoding: 'utf8', env: { ...process.env, ...env } }); }

function evaluateEvidence(path) {
  return spawnSync('pnpm', ['--filter', '@jovie/web', 'exec', 'tsx', 'scripts/check-agent-gate-evidence.ts', path], {
    cwd: root, encoding: 'utf8', env: { ...process.env, AGENT_RUN_SOURCE_RUN_ID: head },
  });
}

function fixture(pull = pr()) {
  const dir = mkdtempSync(resolve(tmpdir(), 'agent-ready-'));
  tempDirs.add(dir);
  const paths = Object.fromEntries(['pr', 'trigger', 'evidence'].map(name => [name, resolve(dir, `${name}.json`)]));
  writeFileSync(paths.pr, JSON.stringify(pull)); writeFileSync(paths.trigger, JSON.stringify(comment()));
  return paths;
}

function stateArgs(path, phase = 'before', expectedHead = head) {
  return `check-state --pr-json ${path} --repository ${repository} --expected-head-sha ${expectedHead} --phase ${phase}`.split(' ');
}
function triggerArgs(actor, login, association) { return ['--trigger-actor', actor, '--trigger-login', login, '--trigger-association', association]; }

describe('trusted evidence policy', () => {
  it('passes the production gate evaluator only with trusted evidence', () => {
    const trusted = evidence({ triggerComment: comment(), trigger: trustedTrigger });
    const untrusted = evidence({ pr: pr({ body: artifact }), commentPages: [[comment(), comment('attacker', 'NONE')]] });
    const evidencePath = fixture().evidence;
    writeFileSync(evidencePath, trusted);
    const result = evaluateEvidence(evidencePath);
    if (result.status !== 0) throw new Error(result.stderr || result.stdout);
    writeFileSync(evidencePath, untrusted);
    const rejected = evaluateEvidence(evidencePath);
    expect(rejected.status).not.toBe(0);
    expect(untrusted).toBe('');
  }, 30_000);

  it('rejects every hold label', () => {
    for (const label of ['needs-human', 'hold', 'gated', 'queue-deferred', 'fast']) {
      expect(() =>
        assertReadyState({ pr: pr({ labels: [{ name: label }] }), ...live, phase: 'before' })
      ).toThrow(`pull request has hold labels: ${label}`);
    }
  });

  it('permits only eligible exact-head PRs to enter the redraft path', () => {
    expect(() => assertRedraftEligibility({ pr: pr({ draft: false }), ...live })).not.toThrow();
    for (const candidate of [
      pr({ head: { ref: 'codex/x', repo: { full_name: 'evil/fork' }, sha: head } }),
      pr({ head: { ref: 'feature/manual', repo: { full_name: repository }, sha: head } }),
      pr({ user: { login: 'attacker' } }),
    ])
      expect(() => assertRedraftEligibility({ pr: candidate, ...live })).toThrow();
  });

  it('classifies canonical agent branches without granting unapproved authors success', () => {
    for (const ref of ['linear/x', 'claude/x', 'codegen-bot/x', 'codex/x', 'agent/x', 'tim/jov-2510']) expect(isAgentBranch(ref)).toBe(true);
    expect(isAgentBranch('dependabot/npm/x')).toBe(false); expect(classifyAgentPr({ pr: pr({ draft: false }), ...live })).toBe('eligible-agent');
    expect(classifyAgentPr({ pr: pr({ user: { login: 'attacker' } }), ...live })).toBe('agent-unapproved'); expect(classifyAgentPr({ pr: pr({ base: { ref: 'dev', repo: { full_name: repository } } }), ...live })).toBe('agent-unapproved');
    expect(classifyAgentPr({ pr: pr({ head: { ref: 'feature/manual', repo: { full_name: repository }, sha: head } }), ...live })).toBe('non-agent');
  });

  it.each([
    ['itstimwhite', 'CONTRIBUTOR'],
    ['attacker', 'MEMBER'],
  ])('excludes %s/%s historical evidence and rejects it as a trigger', (login, association) => {
    expect(evidence({ commentPages: [[comment(login, association)]] })).toBe('');
    expect(() =>
      evidence({
        triggerComment: comment(login, association),
        trigger: { actor: 'itstimwhite', login, association },
      })
    ).toThrow('not trusted');
  });

  it('rejects trigger metadata that mismatches the provenance comment', () => {
    expect(() =>
      evidence({
        triggerComment: comment('attacker', 'MEMBER'),
        trigger: trustedTrigger,
      })
    ).toThrow('provenance do not match');
  });
});

describe('policy CLI', () => {
  it('collects trusted evidence and checks live state', () => {
    const f = fixture();
    expect(run(['collect-evidence', '--pr-json', f.pr, '--evidence-file', f.evidence, ...commonArgs,
      ...triggerArgs('itstimwhite', 'itstimwhite', 'MEMBER'), '--trigger-comment-json', f.trigger]).status).toBe(0);
    expect(readFileSync(f.evidence, 'utf8')).toContain(artifact);
    expect(run(stateArgs(f.pr)).status).toBe(0);
  });

  it('fails closed for untrusted, malformed, stale, and drifted input', () => {
    for (const [actor, login, association] of [
      ['itstimwhite', 'itstimwhite', 'CONTRIBUTOR'],
      ['itstimwhite', 'attacker', 'MEMBER'],
      ['attacker', 'itstimwhite', 'MEMBER'],
    ])
      expect(run(['check-trigger', ...triggerArgs(actor, login, association)]).status).not.toBe(0);
    expect(run(['check-state']).status).not.toBe(0);
    const bad = fixture();
    writeFileSync(bad.pr, '{');
    expect(run(stateArgs(bad.pr)).status).not.toBe(0);
    const stable = fixture();
    expect(run(stateArgs(stable.pr, 'before', 'b'.repeat(40))).status).not.toBe(0);
    expect(run(stateArgs(stable.pr, 'after')).status).not.toBe(0);
    const manual = fixture(
      pr({
        head: {
          ref: 'feature/manual',
          repo: { full_name: repository },
          sha: head,
        },
      })
    );
    expect(run(stateArgs(manual.pr)).status).not.toBe(0);
  });
});

describe('workflow trust structure', () => {
  const { jobs } = workflow;
  const step = (job, name) => job.steps.find(candidate => candidate.name === name);

  it('uses trusted workflow code and isolates exact-head execution', () => {
    expect(workflow.on).toHaveProperty('pull_request_target');
    expect(workflow.on).toHaveProperty('issue_comment');
    expect(workflow.on).not.toHaveProperty('pull_request');
    for (const name of ['resolve', 'verify_ready']) {
      expect(step(jobs[name], 'Checkout trusted default-branch policy').with).toMatchObject({
        ref: '${{ github.event.repository.default_branch }}',
        'persist-credentials': false,
      });
    }
    expect(jobs.verify_head.needs).toEqual(['resolve']);
    expect(jobs.verify_head.if).toBe("github.event_name == 'issue_comment'");
    expect(jobs.verify_ready.needs).toEqual(['resolve', 'verify_head']);
    expect(jobs.verify_ready.if).toBe("github.event_name == 'issue_comment'");
    expect(Object.values(jobs).map(job => job['runs-on'])).toEqual(Array(3).fill('ubuntu-latest'));
    expect(jobs.verify_head.permissions).toEqual({ contents: 'read' });
    expect(step(jobs.verify_head, 'Checkout exact untrusted PR head').with.ref).toBe('${{ needs.resolve.outputs.head_sha }}');
    expect(JSON.stringify(jobs.verify_head)).not.toContain('JOVIE_BOT_PRIVATE_KEY');
    expect(workflowSource).not.toContain('CI_FAST_RUNNER');
  });

  it('re-verifies comments and compensates promotion drift', () => {
    expect(workflow.on.pull_request_target.types).toContain('edited');
    expect(workflow.on.issue_comment.types).toEqual(['created']);
    expect(jobs.resolve.if).toContain('agent-run-artifact');
    expect(step(jobs.resolve, 'Resolve and authorize live pull request').run).toContain('check-trigger');
    const evidence = step(jobs.verify_ready, 'Build trusted GStack gate evidence input').run;
    expect(evidence).toContain('--expected-head-sha "$EXPECTED_HEAD_SHA"');
    expect(evidence).toContain('--trigger-comment-json');
    expect(evidence).not.toContain('/issues/$PR_NUMBER/comments');
    const promotion = step(jobs.verify_ready, 'Mark PR ready if the live state is still eligible').run;
    for (const proof of ['--phase before', '--phase after', 'for attempt in 1 2 3', 'draft restoration was not observable']) {
      expect(promotion).toContain(proof);
    }
  });

  it('keeps untrusted comments out of the cancellable PR lane', () => {
    expect(workflow.concurrency.group).toContain("github.actor == 'itstimwhite'");
    expect(workflow.concurrency.group).toContain("github.event.comment.user.login == 'itstimwhite'");
    expect(workflow.concurrency.group).toContain('github.event.issue.pull_request'); expect(workflow.concurrency.group).toContain('agent-run-artifact');
    expect(workflow.concurrency.group).toContain('agent-pr-verify-untrusted-{0}-{1}');
    expect(workflow.concurrency.group.match(/format\('agent-pr-verify-ready-\{0\}'/g)).toHaveLength(2);
    expect(workflow.concurrency['cancel-in-progress']).toContain("github.event_name == 'pull_request_target'");
    expect(workflow.concurrency['cancel-in-progress']).toContain('github.event.changes.base');
    expect(jobs.resolve.if).toContain("github.actor == 'itstimwhite'");
  });

  it('re-drafts only validated synchronized agent heads before verification', () => {
    const names = jobs.resolve.steps.map(candidate => candidate.name);
    expect(names.indexOf('Resolve and authorize live pull request')).toBeLessThan(names.indexOf('Generate redraft-only Jovie Bot token')); expect(names.indexOf('Restore unverified synchronized head to draft')).toBeLessThan(names.indexOf('Generate advisory-status Jovie Bot token'));
    const restore = step(jobs.resolve, 'Restore unverified synchronized head to draft');
    expect(restore.if).toContain("github.event.action == 'edited'");
    expect(restore.run.indexOf('check-redraft')).toBeLessThan(restore.run.indexOf('gh pr ready'));
    expect(restore.run).toContain('--expected-head-sha "$EXPECTED_HEAD_SHA"');
    expect(restore.run).toContain('draft restoration was not observable');
  });

  it('publishes a fail-closed exact-head status without duplicating PRT checks', () => {
    const resolve = step(jobs.resolve, 'Resolve and authorize live pull request').run;
    expect(resolve).toContain('agent-pr-ready-policy.mjs classify');
    const pending = step(jobs.resolve, 'Publish advisory exact-head status'), success = step(jobs.verify_ready, 'Publish exact-head evidence success');
    expect(pending.run).toContain('statuses/$EXPECTED_HEAD_SHA'); expect(success.run).toContain('statuses/$EXPECTED_HEAD_SHA');
    expect(pending.env.GH_TOKEN).toContain('status-token.outputs.token'); expect(success.env.GH_TOKEN).toContain('success-status-token.outputs.token');
    expect(step(jobs.resolve, 'Generate advisory-status Jovie Bot token').with['permission-statuses']).toBe('write');
    expect(step(jobs.verify_ready, 'Generate success-status Jovie Bot token').with['permission-statuses']).toBe('write');
    expect(jobs.resolve.permissions.statuses).toBeUndefined(); expect(jobs.verify_ready.permissions).toEqual({ contents: 'read', 'pull-requests': 'read' });
    const redraft = step(jobs.resolve, 'Generate redraft-only Jovie Bot token'), promotion = step(jobs.verify_ready, 'Generate promotion-only Jovie Bot token');
    expect(redraft.with['permission-pull-requests']).toBe('write'); expect(promotion.with['permission-pull-requests']).toBe('write');
    expect(step(jobs.resolve, 'Restore unverified synchronized head to draft').env.GH_TOKEN).toContain('redraft-token.outputs.token'); expect(step(jobs.verify_ready, 'Mark PR ready if the live state is still eligible').env.GH_TOKEN).toContain('promotion-token.outputs.token');
  });
});
