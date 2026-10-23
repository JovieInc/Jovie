// biome-ignore-all format: keep the gate detector within the diff budget
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { selectSourceGuards } from '../ci-fast-lanes.mjs';
import { decide, evaluateGateWeakening, formatReport, loadConfig, loadDiffFiles, main, overrideFromEvent } from './gate-weakening-detector.mjs';

const config = loadConfig();
const root = fileURLToPath(new URL('../../', import.meta.url));
const restore = value => (value === '-' ? null : value.replaceAll('\\n', '\n'));
const parse = block =>
  block
    .trim()
    .split('\n')
    .filter(Boolean)
    .map(line => {
      const [kind, path, before, after] = line.split('\t');
      return { kind, path, before: restore(before), after: restore(after) };
    });
const clean = parse(`
-\tapps/web/lib/feature.ts\t-\texport const ready = true;\\n
-\tcodecov.yml\ttarget: 60%\\n\ttarget: 75%\\n
-\tscripts/invariants/sample.allowlist.json\t{"entries":["a","b"]}\\n\t{"entries":["a"]}\\n
-\tapps/web/lib/typed.ts\texport const value = 1;\\n\t// @ts-expect-error legacy caller returns any\\nexport const value = 1;\\n
-\t.github/workflows/ci.yml\ttimeout-minutes: 30\\n\ttimeout-minutes: 10\\n
-\tdocs/performance/route-budgets.json\t  "lcp_ms": 2500\\n\t  "lcp_ms": 2000\\n
-\tscripts/invariants/sample.test.mjs\tit('keeps', () => {});\\n\tit('keeps', () => {});\\nit('adds', () => {});\\n
-\tgithub/rulesets/repository-rules.yml\trequired_status_checks:\\n  - 'CI / fast'\\n\trequired_status_checks:\\n  - 'CI / fast'\\n  - 'CI / PR Ready'\\n
`);
const weakenings = parse(`
required-check-removed\tgithub/rulesets/r.yml\trequired_status_checks:\\n  - 'CI / A'\\n  - 'CI / B'\\n\trequired_status_checks:\\n  - 'CI / A'\\n
ruleset-enforcement-loosened\tgithub/rulesets/extra.yml\tenforcement: active\\n\tenforcement: disabled\\n
branch-strict-loosened\t.github/branch-protection.yml\tstrict: true\\n\tstrict: false\\n
required-reviews-loosened\tgithub/rulesets/reviews.yml\trequired_approving_review_count: 1\\n\trequired_approving_review_count: 0\\n
pr-ready-check-removed\t.github/workflows/ci.yml\tjobs:\\n  ci-pr-ready:\\n    needs: [ci-fast, ci-secret-scan]\\n\tjobs:\\n  ci-pr-ready:\\n    needs: [ci-fast]\\n
source-validation-check-removed\t.github/workflows/source-validation.yml\t  - name: Keep this step\\n  - name: Validate performance\\n\t  - name: Keep this step\\n
source-guard-removed\tscripts/ci-fast-lanes.mjs\texport const SOURCE_GUARDS = [\\n  id: 'external-api-guard',\\n];\\nexport function selectSourceGuards() {}\\n\texport const SOURCE_GUARDS = [\\n];\\nexport function selectSourceGuards() {}\\n
continue-on-error\t.github/workflows/ci.yml\t      - run: pnpm test\\n\t      - run: pnpm test\\n        continue-on-error: true\\n
if-false\t.github/workflows/source-validation.yml\t    - name: Check\\n      run: node x\\n\t    - name: Check\\n      if: false\\n      run: node x\\n
advisory\t.github/workflows/ci.yml\tblocking: true\\n\tblocking: false\\n
shrink-only-growth\tscripts/invariants/sample.allowlist.json\t{"entries":["a"]}\\n\t{"entries":["a","b"]}\\n
shrink-only-growth\tscripts/invariants/sample.baseline.json\t{"count":3}\\n\t{"count":4}\\n
shrink-only-growth\tscripts/invariants/fresh.allowlist\ta\\n\ta\\nb\\n
threshold-loosened\tcodecov.yml\ttarget: 60%\\n\ttarget: 50%\\n
threshold-loosened\tdocs/performance/route-budgets.json\t  "lcp_ms": 2000\\n\t  "lcp_ms": 2500\\n
test-skip\tapps/web/lib/sample.test.ts\tit('works', () => {});\\n\tit.skip('works', () => {});\\n
test-only\tapps/web/lib/sample.test.ts\tit('works', () => {});\\n\tit.only('works', () => {});\\n
xit\tapps/web/lib/sample.test.ts\tconst ready = true;\\n\txit('works', () => {});\\n
eslint-disable\tapps/web/lib/sample.ts\tconst value = 1;\\n\tconst value = 1; // eslint-disable-next-line no-magic\\n
ts-ignore\tapps/web/lib/sample.ts\tconst value = 1;\\n\tconst value = 1; // @ts-ignore\\n
ts-expect-error\tapps/web/lib/sample.ts\tconst value = 1;\\n\t// @ts-expect-error\\nconst value = 1;\\n
biome-ignore\tapps/web/lib/sample.ts\tconst value = 1;\\n\t// biome-ignore lint: demo\\nconst value = 1;\\n
ignore-list-entry\t.eslintignore\tdist\\n\tdist\\ncoverage\\n
ignore-list-entry\tbiome.json\t{"files":{"ignore":["dist"]}}\\n\t{"files":{"ignore":["dist","tmp"]}}\\n
invariant-test-deleted\tscripts/invariants/sample.test.mjs\tit('keeps', () => {});\\n\t-
invariant-test-emptied\tscripts/invariants/other.test.mjs\tit('keeps', () => {});\\n\texport const note = 1;\\n
timeout-raised\t.github/workflows/ci.yml\ttimeout-minutes: 10\\n\ttimeout-minutes: 30\\n
retries-raised\t.github/workflows/e2e.yml\tretries: 1\\n\tretries: 3\\n
`);
const kindsOf = file => evaluateGateWeakening([file], config).map(item => item.kind);
const fileOf = ({ path, before, after }) => ({ path, before, after });
const run = (argv, env, cwd) => {
  let out = '';
  const code = main(argv, env, { stdout: { write: chunk => { out += chunk; } }, cwd });
  return { code, out };
};
describe('JOV-INV-045 gate-weakening detector', () => {
  it('accepts a clean pull request diff', () => {
    assert.deepEqual(evaluateGateWeakening(clean.map(fileOf), config), []);
  });
  it('deliberate red: rejects a Source Validation step removal', () => {
    const findings = evaluateGateWeakening(
      [
        {
          path: '.github/workflows/source-validation.yml',
          before: '  - name: Validate disk-read source contracts from trusted base\n',
          after: '  - name: Unrelated note\n',
        },
      ],
      config
    );
    assert.deepEqual(
      findings.map(item => item.kind),
      ['source-validation-check-removed']
    );
    assert.match(findings[0].detail, /trusted base/);
  });
  it('rejects every required weakening and no other kind', () => {
    const seen = new Set();
    for (const entry of weakenings) {
      const found = kindsOf(entry);
      assert.ok(found.includes(entry.kind), `${entry.kind} missing from ${found}`);
      for (const kind of found) seen.add(kind);
    }
    assert.deepEqual([...seen].sort(), [...config.requiredKinds].sort());
  });
  it('requires both override halves and still prints findings', () => {
    const findings = evaluateGateWeakening([fileOf(weakenings.find(entry => entry.kind === 'threshold-loosened'))], config);
    const allowed = decide(
      findings,
      {
        body: 'note\ngate-change: coverage floor moved\n',
        labels: ['codeowners-approved'],
      },
      config
    );
    assert.equal(allowed.ok, true);
    const report = formatReport(allowed);
    assert.match(report, /OVERRIDE/);
    assert.match(report, /gate-change: coverage floor moved/);
    assert.match(report, /threshold-loosened/);
    assert.equal(decide(findings, { body: 'gate-change: because', labels: [] }, config).ok, false);
    assert.equal(decide(findings, { body: 'gate-change:   ', labels: ['codeowners-approved'] }, config).ok, false);
    assert.match(formatReport(decide(findings, { body: '', labels: [] }, config)), /override missing/);
    const event = overrideFromEvent({
      pull_request: {
        body: 'gate-change: because\n',
        labels: [{ name: 'codeowners-approved' }],
      },
    });
    assert.deepEqual(event.labels, ['codeowners-approved']);
  });
  it('rejects weakening the detector itself', () => {
    const path = 'scripts/invariants/gate-weakening-detector.config.json';
    const before = JSON.stringify(config);
    const expectKind = (after, kind) => assert.ok(kindsOf({ path, before, after }).includes(kind), kind);
    expectKind(JSON.stringify({ ...config, scanExclusions: ['scripts/hidden/'] }), 'scan-exclusion-grew');
    expectKind(JSON.stringify({ ...config, requiredKinds: config.requiredKinds.slice(1) }), 'detector-rule-removed');
    expectKind(JSON.stringify({ ...config, override: { ...config.override, label: 'other' } }), 'override-policy-changed');
    expectKind(null, 'detector-config-deleted');
    assert.ok(kindsOf({ path: 'scripts/invariants/gate-weakening-detector.mjs', before: 'keep\n', after: null }).includes('detector-deleted'));
    const hidden = { path: 'scripts/invariants/fixtures/gate-weakening/sample.ts', before: 'const value = 1;\n', after: 'it.skip("works", () => {});\n' };
    assert.ok(kindsOf(hidden).includes('test-skip'));
    const excluded = { ...config, scanExclusions: ['scripts/invariants/fixtures/gate-weakening/'] };
    assert.deepEqual(evaluateGateWeakening([hidden], excluded), []);
  });
  it('accepts an unchanged copy of the real gate files', () => {
    const paths = ['.github/workflows/ci.yml', '.github/workflows/source-validation.yml', 'scripts/ci-fast-lanes.mjs'];
    const files = paths.map(path => { const text = readFileSync(join(root, path), 'utf8'); return { path, before: text, after: text }; });
    assert.deepEqual(evaluateGateWeakening(files, config), []);
  });
  it('is a blocking pull_request source guard', () => {
    const ids = event => selectSourceGuards(event, ['README.md']).map(guard => guard.id);
    assert.ok(ids('pull_request').includes('gate-weakening-detector'));
    assert.equal(ids('merge_group').includes('gate-weakening-detector'), false);
  });
  it('skips outside pull_request and fails closed when the diff is unreadable', () => {
    const skipped = run([], { GITHUB_EVENT_NAME: 'push' }, root);
    assert.equal(skipped.code, 0);
    assert.match(skipped.out, /skipped \(pull_request only\)/);
    const failed = run(['--check'], { GITHUB_EVENT_NAME: 'pull_request' }, '/tmp/does-not-exist-gate-weakening');
    assert.equal(failed.code, 1);
    assert.match(failed.out, /diff-unreadable/);
  });
  it('reads a committed skip from the base ref diff', () => {
    const dir = mkdtempSync(join(tmpdir(), 'gate-weakening-'));
    const git = args => {
      const result = spawnSync('git', ['-c', 'commit.gpgsign=false', '-c', 'user.email=dev@example.com', '-c', 'user.name=Dev', ...args], { cwd: dir, encoding: 'utf8' });
      assert.equal(result.status, 0, result.stderr);
    };
    try {
      git(['init', '-b', 'main']);
      writeFileSync(join(dir, 'a.test.ts'), "it('works', () => {});\n");
      git(['add', 'a.test.ts']);
      git(['commit', '-m', 'base']);
      git(['checkout', '-b', 'pr']);
      writeFileSync(join(dir, 'a.test.ts'), "it.skip('works', () => {});\n");
      git(['add', 'a.test.ts']);
      git(['commit', '-m', 'skip']);
      assert.ok(evaluateGateWeakening(loadDiffFiles(dir, 'main'), config).some(item => item.kind === 'test-skip'));
      const failed = run(['--check'], { GITHUB_EVENT_NAME: 'pull_request', GITHUB_BASE_REF: 'main' }, dir);
      assert.equal(failed.code, 1);
      assert.match(failed.out, /test-skip/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
