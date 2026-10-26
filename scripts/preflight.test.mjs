import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  applyExclusions,
  chooseConcurrency,
  deriveSteps,
  exclusionReason,
  JOB_ID,
  main,
  prepareStatement,
  splitStatements,
  substitute,
  WORKFLOW_PATH,
} from './preflight.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const workflow = extra => `
name: fixture
jobs:
  ${JOB_ID}:
    steps:
      - uses: actions/checkout@v1
      - name: Contract
        env:
          BASE: \${{ github.base_ref }}
        run: |
          set -euo pipefail
          # a comment
          echo first-ok
          false
          echo "second ran \${BASE}"
          node -e '
            process.exit(3)
          '
          test 1 -eq 2 || exit 7
          echo last-ok
${extra}
`;

async function runPlan(text, extraEnv = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'pf-test-'));
  mkdirSync(path.join(dir, '.github', 'workflows'), { recursive: true });
  writeFileSync(path.join(dir, WORKFLOW_PATH), text);
  const lines = [];
  const code = await main({
    argv: ['--workflow', path.join(dir, WORKFLOW_PATH)],
    env: {
      JOVIE_PREFLIGHT_LEDGER: 'off',
      PATH: process.env.PATH,
      ...extraEnv,
    },
    log: line => lines.push(line),
    cwd: dir,
  });
  return { code, out: lines.join('\n') };
}

test('splitStatements keeps multi-line quotes together and drops comments', () => {
  const statements = splitStatements(
    "# c\necho a\nnode -e '\n  1\n'\nfoo \\\n  bar\n"
  );
  assert.equal(statements.length, 3);
  assert.match(statements[1], /^node -e/);
});

test('set -e is neutralised and || exit is contained', () => {
  assert.equal(prepareStatement('set -euo pipefail'), 'set -uo pipefail');
  assert.match(prepareStatement('test 1 -eq 2 || exit 7'), /^\( test/);
  assert.match(prepareStatement('if x; then\n exit 0\nfi'), /^\( if/);
});

test('substitute reports expressions with no local value', () => {
  const { text, unresolved } = substitute('a ${{ x.y }} ${{ k }}', { k: 'v' });
  assert.equal(text, 'a  v');
  assert.deepEqual(unresolved, ['x.y']);
});

test('lists every failing statement in one pass, not just the first', async () => {
  const { code, out } = await runPlan(workflow(''));
  assert.equal(code, 1);
  assert.match(out, /FAIL \(1\)  false/);
  assert.match(out, /FAIL \(3\)  node -e/);
  assert.match(out, /FAIL \(7\)  test 1 -eq 2 \|\| exit 7/);
  assert.match(out, /3 item\(s\) to fix/);
});

test('a step added to the workflow appears in the derived plan and runs', async () => {
  const added = `      - name: Brand new gate
        run: node -e "process.exit(9)"`;
  assert.ok(
    deriveSteps(workflow(added)).some(step => step.name === 'Brand new gate')
  );
  const { out } = await runPlan(workflow(added));
  assert.match(out, /== Brand new gate/);
  assert.match(out, /FAIL \(9\)/);
});

test('every step is either planned to run or skipped with a written reason', () => {
  const steps = deriveSteps(
    readFileSync(path.join(ROOT, WORKFLOW_PATH), 'utf8')
  );
  for (const step of steps) {
    assert.ok(
      step.skip ? step.skip.length > 3 : step.run.trim().length > 0,
      `${step.name}: neither runnable nor skipped with a reason`
    );
  }
});

test('the real Source Validation workflow yields the gates workers keep missing', () => {
  const steps = deriveSteps(
    readFileSync(path.join(ROOT, WORKFLOW_PATH), 'utf8')
  );
  const runnable = steps
    .filter(step => !step.skip)
    .map(step => step.run)
    .join('\n');
  for (const gate of [
    'component-ship-gate',
    'screen-registration-gate',
    'lint:eslint:changed',
    'pnpm typecheck',
  ])
    assert.ok(runnable.includes(gate), `${gate} missing from derived plan`);
});

test('no derived step writes a fixed shared /tmp path', () => {
  const steps = deriveSteps(
    readFileSync(path.join(ROOT, WORKFLOW_PATH), 'utf8')
  );
  for (const step of steps)
    assert.doesNotMatch(
      step.run,
      /(?<![\w$}/])\/tmp\/[\w.-]/,
      `${step.name} uses a fixed /tmp path; use mktemp or RUNNER_TEMP`
    );
});

test('concurrency follows free RAM and load, with an override', () => {
  const host = { freeGb: 30, load1: 2, cores: 16 };
  assert.equal(chooseConcurrency(host), 3);
  assert.equal(chooseConcurrency({ ...host, freeGb: 12 }), 1);
  assert.equal(chooseConcurrency({ ...host, freeGb: 9 }), 1);
  assert.equal(chooseConcurrency({ ...host, load1: 25 }), 1);
  assert.equal(chooseConcurrency({ ...host, override: '2' }), 2);
});

test('heavy statements are excluded with a reason, light ones are not', () => {
  assert.match(exclusionReason('pnpm typecheck'), /hosted CI/);
  assert.match(exclusionReason('pnpm run typecheck:scripts'), /hosted CI/);
  assert.match(
    exclusionReason('pnpm --filter @jovie/web run typecheck:tests'),
    /hosted CI/
  );
  assert.equal(exclusionReason('pnpm component-ship-gate'), '');
  assert.equal(exclusionReason('pnpm screen-registration-gate'), '');
  assert.equal(
    exclusionReason(
      'ESLINT_CHANGED_BASE="origin/main" pnpm --filter @jovie/web run lint:eslint:changed'
    ),
    ''
  );
  assert.equal(exclusionReason('web_types_pid=$!'), '');
});

test('every typecheck/build statement in the real workflow is excluded', () => {
  const steps = deriveSteps(
    readFileSync(path.join(ROOT, WORKFLOW_PATH), 'utf8')
  );
  for (const step of steps.filter(s => !s.skip))
    for (const statement of splitStatements(step.run))
      assert.doesNotMatch(
        applyExclusions(statement).text,
        /\bpnpm\b[^\n]*\btypecheck\b/,
        statement
      );
});

test('steps run concurrently and still list every failure', async () => {
  const slow = n => `      - name: Slow ${n}
        run: node -e "setTimeout(() => process.exit(${n}), 700)"`;
  const started = Date.now();
  const { code, out } = await runPlan(workflow([slow(4), slow(5)].join('\n')), {
    PREFLIGHT_JOBS: '3',
  });
  assert.equal(code, 1);
  assert.match(out, /FAIL \(4\)/);
  assert.match(out, /FAIL \(5\)/);
  assert.ok(Date.now() - started < 1400 + 3000);
});

test('commands inside a compound statement are excluded line by line', () => {
  const { text, excluded } = applyExclusions(
    '(\n  pnpm --filter @jovie/web run typecheck:tests\n  pnpm component-ship-gate\n)'
  );
  assert.match(text, /^\(\n {2}true\n {2}pnpm component-ship-gate\n\)$/);
  assert.equal(excluded.length, 1);
});
