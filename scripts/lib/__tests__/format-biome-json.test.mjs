import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  biomeDiagnosticCategories,
  isInsideRepo,
  listWorkspaceBiomeOutsideRepoHits,
  PROBE_PARENT,
  runBiomeOnRepoProbes,
  sourceProbesWorkspaceBiomeOutsideRepo,
  workspaceBiomeBin,
} from '../biome-repo-probe.mjs';
import { formatBiomeJson } from '../format-biome-json.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

function biomeAccepts(text) {
  const result = runBiomeOnRepoProbes(REPO_ROOT, [
    { name: 'sample.json', text },
  ]);
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `biome check failed (${result.status}): ${result.stderr || result.stdout}`
    );
  }
}

describe('formatBiomeJson', () => {
  it('collapses a primitive array onto one line when that line fits in 80 columns', () => {
    const value = {
      growthTrend: 'unknown',
      regressions: ['lead_time.codex.p95', 'remediation.main_red_to_green.p95'],
      flatStall: false,
    };
    const formatted = formatBiomeJson(value);
    const expanded = `${JSON.stringify(value, null, 2)}\n`;

    assert.notEqual(formatted, expanded);
    assert.match(
      formatted,
      /"regressions": \["lead_time\.codex\.p95", "remediation\.main_red_to_green\.p95"\],/
    );
    biomeAccepts(formatted);
    assert.equal(formatBiomeJson(JSON.parse(formatted)), formatted);
  });

  it('keeps a primitive array expanded when the single line would pass 80 columns', () => {
    const fitting = 'a'.repeat(80 - '  "regressions": [""],'.length);
    const overflowing = `${fitting}a`;
    const fit = formatBiomeJson({
      regressions: [fitting],
      flatStall: false,
    });
    const overflow = formatBiomeJson({
      regressions: [overflowing],
      flatStall: false,
    });

    assert.match(fit, new RegExp(`"regressions": \\["${fitting}"\\],`));
    assert.match(overflow, new RegExp(`\\[\n\\s+"${overflowing}"\n\\s+\\],`));
    biomeAccepts(fit);
    biomeAccepts(overflow);
  });

  it('collapses nested primitive arrays and leaves object layout expanded', () => {
    const formatted = formatBiomeJson({
      samples: [
        {
          selectedChecks: ['Blog Content Qualification', 'Golden Path Lock'],
        },
      ],
    });

    assert.match(
      formatted,
      /"selectedChecks": \["Blog Content Qualification", "Golden Path Lock"\]/
    );
    assert.match(formatted, /"samples": \[\n/);
    biomeAccepts(formatted);
  });

  it('keeps the committed snapshots in the shape Biome already accepts', () => {
    for (const relative of [
      'docs/metrics/shipping-slo-latest.json',
      'docs/metrics/blog-publish-latency-latest.json',
    ]) {
      const text = readFileSync(resolve(REPO_ROOT, relative), 'utf8');
      assert.equal(formatBiomeJson(JSON.parse(text)), text, relative);
      biomeAccepts(text);
    }

    // The baseline comment stores the arrow as \u2192. JSON.stringify prints
    // the character, and no primitive array in that document collapses.
    const baseline = readFileSync(
      resolve(REPO_ROOT, 'docs/metrics/shipping-slo-baseline.json'),
      'utf8'
    );
    const parsed = JSON.parse(baseline);
    assert.equal(
      formatBiomeJson(parsed),
      `${JSON.stringify(parsed, null, 2)}\n`
    );
    biomeAccepts(baseline);
    biomeAccepts(formatBiomeJson(parsed));
  });
});

describe('workspace biome probes stay inside the repo', () => {
  it('rejects a probe name that could leave the workspace', () => {
    assert.throws(
      () =>
        runBiomeOnRepoProbes(REPO_ROOT, [
          { name: '../sample.json', text: '{}\n' },
        ]),
      /basename/
    );
  });

  it('keeps the probe directory inside the repo and visible to git', () => {
    assert.equal(workspaceBiomeBin(REPO_ROOT).endsWith('bin/biome'), true);
    assert.equal(
      isInsideRepo(REPO_ROOT, resolve(REPO_ROOT, PROBE_PARENT)),
      true
    );
    // Built without a quoted /tmp literal: the hermetic guard rejects those.
    const outside = ['', 'tmp', 'biome-outside'].join('/');
    assert.equal(isInsideRepo(REPO_ROOT, outside), false);
    const ignored = spawnSync(
      'git',
      ['check-ignore', '-q', '--', `${PROBE_PARENT}/sample.json`],
      { cwd: REPO_ROOT, encoding: 'utf8' }
    );
    assert.equal(ignored.status, 1);
  });

  it('parses biome json diagnostics and treats a panic with no json as empty', () => {
    assert.deepEqual(
      biomeDiagnosticCategories({
        stdout:
          'note\n{"diagnostics":[{"category":"lint/style/noRestrictedImports"}]}',
      }),
      ['lint/style/noRestrictedImports']
    );
    assert.deepEqual(biomeDiagnosticCategories({ stdout: '' }), []);
    assert.deepEqual(
      biomeDiagnosticCategories({ stdout: '{"diagnostics":[]}' }),
      []
    );
  });

  it('flags a workspace biome binary aimed at a temp directory', () => {
    const open = 'tmp' + 'dir(';
    const deliberate = [
      "const BIOME = resolve(REPO_ROOT, 'node_modules/@biomejs/biome/bin/biome');",
      `const dir = mkdtempSync(join(${open}), 'biome-json-'));`,
      "execFileSync(BIOME, ['check', path]);",
    ].join('\n');
    assert.deepEqual(sourceProbesWorkspaceBiomeOutsideRepo(deliberate), [
      'BIOME',
    ]);
    const prePush = readFileSync(
      resolve(REPO_ROOT, 'scripts/hooks/pre-push-gate.test.mjs'),
      'utf8'
    );
    assert.deepEqual(sourceProbesWorkspaceBiomeOutsideRepo(prePush), []);
    assert.deepEqual(listWorkspaceBiomeOutsideRepoHits(REPO_ROOT), []);
  });
});
