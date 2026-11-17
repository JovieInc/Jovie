import assert from 'node:assert/strict';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { classifySourceDocs } from '../source-docs-scope.mjs';

const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));

test('ordinary research and design prose with no contract readers qualifies', () => {
  const paths = [
    'docs/research/source-validation-fastpath-notes.md',
    'docs/design-system/source-validation-research-notes.md',
  ];
  assert.deepEqual(classifySourceDocs(paths), {
    eligible: true,
    reasons: [],
    paths: [...paths].sort(),
  });
});

test('Summer prose does not require the application suite by itself', () => {
  const result = classifySourceDocs(['docs/company/ci-research-notes.md']);
  assert.equal(result.eligible, true, result.reasons.join('\n'));
});

test('build, policy, agent, generated, and source-bound docs retain full validation', () => {
  for (const path of [
    'CHANGELOG.md',
    'AGENTS.md',
    'CLAUDE.md',
    'CODEX.md',
    'DESIGN.md',
    'SECURITY.md',
    'LESSONS.md',
    '.claude/rules/security.md',
    '.agents/skills/example/SKILL.md',
    'canon/OPERATING_SYSTEM.md',
    'apps/web/content/blog/research.md',
    'apps/docs/content/research.mdx',
    'docs/playbooks/example.playbook.md',
    'docs/PR_FLOW.md',
    'docs/TESTING_STRATEGY.md',
    'docs/REPOSITORY_SOURCES.md',
    'docs/ci/CI_RELEASE_INCIDENTS.md',
    'docs/research/security-guidance.md',
    'docs/research/policy.md',
    'docs/research/generated/report.md',
    '.github/workflows/README.md',
    'skills/jovie/SKILL.md',
  ]) {
    const result = classifySourceDocs([path]);
    assert.equal(result.eligible, false, path);
    assert.ok(result.reasons.length > 0, path);
  }
});

test('the gardening fixture retains the contracts that actually read it', () => {
  const result = classifySourceDocs(['docs/doc-gardening/SEED-STALE.md']);
  assert.equal(result.eligible, false);
  assert.ok(
    result.reasons.some(reason => /contract|source-bound/.test(reason))
  );
});

test('mixed, empty, malformed, and unknown paths fail closed', () => {
  for (const paths of [
    [],
    null,
    undefined,
    'docs/research/notes.md',
    ['docs/research/notes.md', 'apps/web/app/page.tsx'],
    ['docs/research/notes.md', 'pnpm-lock.yaml'],
    ['docs/research/notes.md', '.github/workflows/source-validation.yml'],
    ['docs/research/notes.md', 'unknown.binary'],
    ['../docs/research/notes.md'],
    ['docs//research/notes.md'],
    ['docs/research/notes.md\nother.md'],
    ['docs\\research\\notes.md'],
    [' docs/research/notes.md'],
    [123],
  ]) {
    const result = classifySourceDocs(paths);
    assert.equal(result.eligible, false, JSON.stringify(paths));
    assert.ok(result.reasons.length > 0);
  }
});

test('a missing policy or test-catalog root cannot authorize a fast path', t => {
  const root = mkdtempSync(join(tmpdir(), 'source-docs-missing-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const result = classifySourceDocs(['docs/research/notes.md'], { root });
  assert.equal(result.eligible, false);
  assert.ok(
    result.reasons.some(reason => /unavailable|incomplete/.test(reason))
  );
});

test('new risk, generated, and source-bound registrations apply without a copied path list', t => {
  const path = 'docs/research/newly-registered-contract.md';
  const files = [
    '.github/ci-harness/manifest.json',
    'docs/doc-freshness-registry.json',
    'repository-docs.json',
    '.github/ci-harness/ci-release-incidents.json',
  ];
  const updates = [
    {
      file: files[0],
      update: data =>
        data.riskRules.push({
          id: 'new-risk',
          patterns: ['newly-registered-contract'],
        }),
      reason: 'risk-rule:new-risk',
    },
    {
      file: files[0],
      update: data => data.generatedDocs.push({ path }),
      reason: 'source-bound-document',
    },
    {
      file: files[1],
      update: data => {
        data.documentReviews[path] = { sources: [] };
      },
      reason: 'source-bound-document',
    },
    {
      file: files[2],
      update: data => {
        data.output = path;
      },
      reason: 'source-bound-document',
    },
    {
      file: files[3],
      update: data => {
        data.incidents[0].documentation.operator = path;
      },
      reason: 'source-bound-document',
    },
  ];
  for (const { file, update, reason } of updates) {
    const root = mkdtempSync(join(tmpdir(), 'source-docs-registry-'));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    for (const source of files) {
      const data = JSON.parse(readFileSync(resolve(REPO_ROOT, source), 'utf8'));
      if (source === file) update(data);
      mkdirSync(dirname(join(root, source)), { recursive: true });
      writeFileSync(join(root, source), JSON.stringify(data));
    }
    const result = classifySourceDocs([path], { root });
    assert.equal(result.eligible, false);
    assert.ok(
      result.reasons.some(value => value.startsWith(reason)),
      result.reasons.join('\n')
    );
  }
});
