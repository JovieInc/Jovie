import assert from 'node:assert/strict';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { runDesignGovernanceAudit } from './design-governance-audit.mjs';

const GOVERNANCE_WORKFLOW_PATH = '.github/workflows/design-governance.yml';

function fixtureRepo(setup) {
  const root = mkdtempSync(path.join(tmpdir(), 'design-governance-audit-'));
  try {
    setup(root);
    return runDesignGovernanceAudit(root, { includeAuthorityMap: false });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const check = (audit, id) => audit.results.find(item => item.id === id);

const CONFORMANCE_AUDIT_OPTIONS = Object.freeze({
  includeAuthorityMap: false,
});
const runConformanceAudit = () =>
  runDesignGovernanceAudit(undefined, CONFORMANCE_AUDIT_OPTIONS);

test('repo design governance audit has no FAIL checks', () => {
  const { failed, results } = runConformanceAudit();
  assert.ok(results.length > 0, 'audit must report at least one check');
  assert.deepEqual(
    failed,
    [],
    failed.map(item => `${item.id}: ${item.detail}`).join('\n')
  );
});

test('audit confirms the standing enforcement commands are wired into ci-fast', () => {
  const { results } = runConformanceAudit();
  const wiring = results.find(item => item.id === 'enforcement-wiring');
  assert.equal(wiring?.status, 'PASS');
  assert.match(wiring.detail, /design:governance:audit/);
  assert.match(wiring.detail, /design:tokens:export:check/);
  assert.match(wiring.detail, /design:authority:check/);
  assert.match(wiring.detail, /lint:touch-target/);
  const scripts = results.find(item => item.id === 'package-scripts');
  assert.equal(scripts?.status, 'PASS');
});

test('keeps local-only authority map out of conformance audit tests', () => {
  const { results } = runConformanceAudit();
  const authority = results.find(
    item => item.id === 'design-system-authority-map'
  );
  assert.equal(authority, undefined);
});

test('binds design projections to the canonical invariant registry', () => {
  const { results } = runConformanceAudit();
  const projection = results.find(
    item => item.id === 'design-invariant-projection'
  );
  assert.equal(projection?.status, 'PASS');
  assert.match(projection.detail, /JOV-INV-019/);
  assert.match(projection.detail, /executable generator and guard bindings/);
  const audit = results.find(item => item.id === 'shared-ui-visual-arbitrary');
  assert.equal(audit?.status, 'PASS');
  assert.match(audit.detail, /visual findings/);
  const outcome = results.find(item => item.id === 'shadcn-outcome-inventory');
  assert.equal(outcome?.status, 'PASS');
  assert.match(outcome.detail, /MIT public-outcome boundary/);
  const wiring = results.find(
    item => item.id === 'shared-ui-visual-arbitrary-wiring'
  );
  assert.equal(wiring?.status, 'PASS');
  assert.match(wiring.detail, /design:shared-ui-visual-arbitrary:check/);
});

test('drift ledger is wired as a shrink-only governance check (JOV-6850)', () => {
  const { results } = runConformanceAudit();
  const ledger = results.find(item => item.id === 'design-drift-ledger');
  assert.ok(ledger, 'design-drift-ledger check must run');
  assert.notEqual(ledger.status, 'FAIL', ledger.detail);
});

test('design-drift-ledger FAILs when ledger inputs are unreadable', () => {
  const audit = fixtureRepo(() => {});
  const result = check(audit, 'design-drift-ledger');
  assert.equal(result?.status, 'FAIL');
  assert.match(result.detail, /drift ledger unreadable/);
});

test('skill-symlinks FAILs on dangling symlinks, nested included (JOV-5231)', () => {
  const audit = fixtureRepo(root => {
    const skills = path.join(root, '.claude/skills');
    mkdirSync(path.join(skills, 'group'), { recursive: true });
    mkdirSync(path.join(skills, 'live'), { recursive: true });
    writeFileSync(path.join(skills, 'live/SKILL.md'), '# live\n');
    symlinkSync('../missing-target', path.join(skills, 'dangling'));
    symlinkSync(
      '../../missing-nested-target',
      path.join(skills, 'group/nested-dangling')
    );
    writeFileSync(path.join(root, 'skills-lock.json'), '{"ownedSkills": []}');
  });
  const result = check(audit, 'skill-symlinks');
  assert.equal(result?.status, 'FAIL');
  assert.match(result.detail, /dangling symlink/);
  assert.match(result.detail, /\.claude\/skills\/dangling/);
  assert.match(result.detail, /\.claude\/skills\/group\/nested-dangling/);
});

test('skills-lock-pins FAILs with the exact missing ownedSkills name (JOV-5231)', () => {
  const audit = fixtureRepo(root => {
    const skills = path.join(root, '.claude/skills');
    mkdirSync(path.join(skills, 'present'), { recursive: true });
    writeFileSync(path.join(skills, 'present/SKILL.md'), '# present\n');
    writeFileSync(
      path.join(root, 'skills-lock.json'),
      '{"ownedSkills": ["present", "ghost-skill"]}'
    );
  });
  const result = check(audit, 'skills-lock-pins');
  assert.equal(result?.status, 'FAIL');
  assert.match(result.detail, /ghost-skill/);
  assert.doesNotMatch(result.detail, /\bpresent\b/);
});

test('skill-symlinks FAILs when .claude/skills is missing entirely (JOV-5231)', () => {
  const audit = fixtureRepo(() => {});
  const result = check(audit, 'skill-symlinks');
  assert.equal(result?.status, 'FAIL');
  assert.match(result.detail, /\.claude\/skills is missing/);
  const pins = check(audit, 'skills-lock-pins');
  assert.equal(pins?.status, 'FAIL');
});

test('governance workflow provides typescript before the audit (JOV-7157)', () => {
  // The audit imports component-ship-policy.mjs, which needs the TypeScript
  // compiler; the job intentionally skips pnpm install, so the workflow must
  // materialize typescript into node_modules before invoking the audit.
  const workflow = readFileSync(GOVERNANCE_WORKFLOW_PATH, 'utf8');
  const installIdx = workflow.indexOf('npm pack "typescript@');
  const auditIdx = workflow.indexOf('node scripts/design-governance-audit.mjs');
  assert.ok(installIdx > -1, 'workflow must install typescript');
  assert.ok(
    installIdx < auditIdx,
    'typescript install must precede the audit step'
  );
});

test('governance workflow gates PRs that touch skill plumbing (JOV-5231)', () => {
  const workflow = readFileSync(GOVERNANCE_WORKFLOW_PATH, 'utf8');
  const pullRequest = workflow.split('pull_request:')[1] ?? '';
  const prPaths = pullRequest.split('repository_dispatch:')[0] ?? '';
  assert.match(prPaths, /'\.claude\/skills\/\*\*'/);
  assert.match(prPaths, /'skills-lock\.json'/);
  const push = workflow.split('push:')[1] ?? '';
  const pushPaths = push.split('pull_request:')[0] ?? '';
  assert.match(pushPaths, /'\.claude\/skills\/\*\*'/);
  assert.match(pushPaths, /'skills-lock\.json'/);
});
