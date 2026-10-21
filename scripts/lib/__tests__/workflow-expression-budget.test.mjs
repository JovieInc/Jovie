import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { load } from 'js-yaml';
import { test } from 'vitest';
import {
  EXPRESSION_LIMIT,
  evaluateRunScriptBudget,
  formatExpressionLength,
  introducedOverBudget,
  runScriptSizes,
} from '../../workflow-expression-budget.mjs';

const SCRIPT = resolve('scripts/workflow-expression-budget.mjs');

// The 2026-10-20 stall: ci.yml's path-detect step carries 18 interpolations.
// Main's script built a 20,773-character format() expression and loaded; #21826
// grew it to 21,052 and GitHub refused the whole workflow (zero-job runs).
function detectScript(targetExpressionLength) {
  const head = Array.from(
    { length: 18 },
    (_, index) => `echo "\${{ steps.s${index}.outputs.value }}"\n`
  ).join('');
  let body = head;
  while ((formatExpressionLength(body) ?? 0) < targetExpressionLength - 70) {
    body += `# ${'x'.repeat(60)}\n`;
  }
  while ((formatExpressionLength(body) ?? 0) < targetExpressionLength) {
    body += 'x';
  }
  return body;
}

function workflow(run) {
  const indented = run
    .split('\n')
    .map(line => (line ? `          ${line}` : ''))
    .join('\n');
  return `name: CI\non:\n  merge_group:\njobs:\n  ci-path-changes:\n    runs-on: ubuntu-latest\n    steps:\n      - name: Detect path changes for all job types\n        id: detect\n        run: |\n${indented}\n`;
}

test('measures the format() expression GitHub builds, not raw length', () => {
  assert.equal(formatExpressionLength('echo plain'), null);
  // Braces double and quotes double in the format string.
  assert.equal(
    formatExpressionLength("echo '{x}' ${{ github.sha }}"),
    "format('echo ''{{x}}'' {0}', github.sha)".length
  );
  // A 37k-character script with no interpolation is not an expression at all.
  const sizes = runScriptSizes(
    'big.yml',
    workflow(`echo ${'y'.repeat(37_000)}`)
  );
  assert.deepEqual(sizes, []);
});

test('replays #21826: 20,773 loads with a warning, 21,052 is over budget', () => {
  const main = runScriptSizes('ci.yml', workflow(detectScript(20_773)));
  const merged = runScriptSizes('ci.yml', workflow(detectScript(21_052)));
  assert.equal(main.length, 1);
  assert.ok(evaluateRunScriptBudget(main).ok);
  assert.equal(evaluateRunScriptBudget(main).near.length, 1);
  const verdict = evaluateRunScriptBudget(merged);
  assert.equal(verdict.ok, false);
  assert.equal(verdict.over[0].step, 'Detect path changes for all job types');
  assert.ok(EXPRESSION_LIMIT < 21_000);
});

test('a group stacked on an already broken base is a victim, not the culprit', () => {
  const broken = runScriptSizes('ci.yml', workflow(detectScript(21_052)));
  const healthy = runScriptSizes('ci.yml', workflow(detectScript(20_773)));
  assert.equal(introducedOverBudget(broken, healthy).over.length, 1);
  const victim = introducedOverBudget(broken, broken);
  assert.equal(victim.over.length, 0);
  assert.equal(victim.inherited.length, 1);
});

for (const hasId of [true, false]) {
  test(`renaming an inherited broken step stays a victim ${hasId ? 'with' : 'without'} an id`, () => {
    let original = workflow(detectScript(21_052));
    if (!hasId) original = original.replace('        id: detect\n', '');
    const renamed = original.replace(
      'name: Detect path changes for all job types',
      'name: Renamed detection step'
    );
    const result = introducedOverBudget(
      runScriptSizes('ci.yml', renamed),
      runScriptSizes('ci.yml', original)
    );
    assert.equal(result.over.length, 0);
    assert.equal(result.inherited.length, 1);
  });
}

test('the workflow hydrates sparse-checkout blobs before scanning offline', () => {
  const root = mkdtempSync(join(tmpdir(), 'workflow-budget-fetch-'));
  const source = join(root, 'source');
  const clone = join(root, 'clone');
  const git = (cwd, ...args) =>
    execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  try {
    mkdirSync(join(source, 'scripts'), { recursive: true });
    mkdirSync(join(source, '.github/workflows'), { recursive: true });
    git(source, 'init', '--quiet', '--initial-branch=main');
    git(source, 'config', 'user.name', 'Budget test');
    git(source, 'config', 'user.email', 'budget@example.invalid');
    git(source, 'config', 'uploadpack.allowFilter', 'true');
    writeFileSync(
      join(source, 'scripts/workflow-expression-budget.mjs'),
      readFileSync(SCRIPT)
    );
    for (const [name, length] of [
      ['ci', 21_052],
      ['other', 20_000],
    ]) {
      writeFileSync(
        join(source, `.github/workflows/${name}.yml`),
        workflow(detectScript(length))
      );
    }
    git(source, 'add', '.');
    git(source, 'commit', '--quiet', '-m', 'base');
    const base = git(source, 'rev-parse', 'HEAD');
    git(
      root,
      'clone',
      '--quiet',
      '--no-checkout',
      '--depth=1',
      '--filter=blob:none',
      `file://${source}`,
      clone
    );
    git(
      clone,
      'sparse-checkout',
      'set',
      '--no-cone',
      '/scripts/workflow-expression-budget.mjs'
    );
    git(clone, 'checkout', '--quiet', 'main');
    symlinkSync(resolve('node_modules'), join(clone, 'node_modules'), 'dir');
    writeFileSync(join(source, 'notes.txt'), 'group-only change');
    git(source, 'add', 'notes.txt');
    git(source, 'commit', '--quiet', '-m', 'group');
    const head = git(source, 'rev-parse', 'HEAD');
    const configuration =
      /** @type {{ jobs: Record<string, { steps: { name?: string, run?: string }[] }> }} */ (
        load(readFileSync('.github/workflows/pr-size-guard.yml', 'utf8'))
      );
    const step = configuration.jobs['merge-group-workflow-load'].steps.find(
      step => step.name === 'Require combined-head workflows to load'
    );
    assert.ok(step?.run);
    const fetchScript = step.run.split('unset AUTH_HEADER')[0];
    assert.notEqual(fetchScript, step.run);
    const result = spawnSync('bash', ['-c', fetchScript], {
      cwd: clone,
      encoding: 'utf8',
      env: {
        ...process.env,
        GH_TOKEN: 'fixture-token',
        GROUP_BASE: base,
        GROUP_HEAD: head,
      },
      timeout: 15_000,
    });
    assert.equal(result.status, 0, result.stdout + result.stderr);
    // The fetch must hydrate files before the scan can trigger lazy requests.
    renameSync(source, join(root, 'offline-source'));
    const offline = spawnSync(process.execPath, [SCRIPT, '--ref', head], {
      cwd: clone,
      encoding: 'utf8',
      env: { ...process.env, GIT_NO_LAZY_FETCH: '1' },
      timeout: 10_000,
    });
    assert.equal(offline.status, 1, offline.stdout + offline.stderr);
    assert.match(offline.stdout, /over the 20950 budget/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('CLI fails the exact head and the head merged into a moved base', () => {
  const root = mkdtempSync(join(tmpdir(), 'workflow-budget-'));
  const git = (...args) =>
    execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
  const write = (text, extra = '') => {
    mkdirSync(join(root, '.github/workflows'), { recursive: true });
    writeFileSync(join(root, '.github/workflows/ci.yml'), text);
    writeFileSync(join(root, 'notes.txt'), extra);
  };
  const run = (...args) =>
    spawnSync(process.execPath, [SCRIPT, ...args], {
      cwd: root,
      encoding: 'utf8',
    });
  try {
    git('init', '--quiet', '--initial-branch=main');
    git('config', 'user.name', 'Budget test');
    git('config', 'user.email', 'budget@example.invalid');
    // Base: a detect script with headroom.
    const base = detectScript(20_600);
    write(workflow(base));
    git('add', '.');
    git('commit', '--quiet', '-m', 'base');
    const baseSha = git('rev-parse', 'HEAD');
    // A stale branch adds lines at the top of the script: under budget alone.
    git('checkout', '--quiet', '-b', 'stale');
    write(workflow(`# stale branch line ${'s'.repeat(220)}\n${base}`));
    git('commit', '--quiet', '-am', 'stale branch');
    // Main grows the same script at the bottom, still under budget alone.
    git('checkout', '--quiet', 'main');
    write(workflow(`${base}# main growth ${'m'.repeat(220)}\n`), 'main');
    git('commit', '--quiet', '-am', 'main grows');

    assert.equal(run('--ref', 'stale').status, 0, 'stale head alone loads');
    assert.equal(run('--ref', 'main').status, 0, 'main alone loads');
    const merged = run('--ref', 'stale', '--merge-with', 'main');
    assert.equal(merged.status, 1, merged.stdout + merged.stderr);
    assert.match(merged.stdout, /stale merged into main/);
    assert.match(merged.stdout, /::error file=\.github\/workflows\/ci\.yml/);

    // Merge-group mode: culprit fails, a victim on a broken base passes.
    git('checkout', '--quiet', '-b', 'over', baseSha);
    write(workflow(detectScript(21_052)));
    git('commit', '--quiet', '-am', 'over budget');
    assert.equal(run('--ref', 'over', '--introduced-since', baseSha).status, 1);
    git('checkout', '--quiet', '-b', 'victim', 'over');
    writeFileSync(join(root, 'notes.txt'), 'victim change');
    git('commit', '--quiet', '-am', 'victim');
    assert.equal(
      run('--ref', 'victim', '--introduced-since', 'over').status,
      0
    );

    // A missing YAML tool must never eject a healthy group.
    const noTool = spawnSync(
      process.execPath,
      [SCRIPT, '--ref', 'over', '--introduced-since', baseSha],
      {
        cwd: root,
        encoding: 'utf8',
        env: { PATH: '/nonexistent', WORKFLOW_BUDGET_YAML: 'yq' },
      }
    );
    assert.equal(noTool.status, 0, noTool.stdout + noTool.stderr);
    assert.match(noTool.stdout, /could not be evaluated/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
