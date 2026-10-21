import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
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
