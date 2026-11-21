import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  SCRIPT_CONTRACT_NODE_TESTS,
  scriptContractNodeArgs,
} from './ci-fast-lanes.mjs';
import { runPreflightCoverage } from './lib/preflight-coverage.mjs';
import { selectScriptContracts } from './lib/script-contract-affected.mjs';
import { sh } from './preflight-changed.mjs';

const repo = fileURLToPath(new URL('..', import.meta.url));
const vitest = path.join(repo, 'node_modules/vitest/vitest.mjs');
const env = Object.fromEntries(
  Object.entries(process.env).filter(
    ([key]) => !key.startsWith('GIT_') && key !== 'NODE_TEST_CONTEXT'
  )
);

test('the existing affected CI selector runs both preflight and coverage contracts', () => {
  const selected = selectScriptContracts(
    ['scripts/lib/preflight-coverage.mjs'],
    {
      root: repo,
      derivedOnly: true,
    }
  );
  const args = scriptContractNodeArgs(selected.node).flat();
  assert.ok(args.includes('scripts/preflight-changed.test.mjs'));
  assert.ok(args.includes('scripts/preflight-coverage.test.mjs'));
  assert.ok(
    SCRIPT_CONTRACT_NODE_TESTS.some(entry =>
      entry.split(' ').includes('scripts/preflight-coverage.test.mjs')
    )
  );
});

function fixture({ answer = 42, uncovered = false } = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'preflight-coverage-'));
  const web = path.join(root, 'apps/web');
  mkdirSync(web, { recursive: true });
  mkdirSync(path.join(root, 'scripts/lib'), { recursive: true });
  for (const file of [
    'check-changed-test-coverage.mjs',
    'lib/changed-test-coverage.mjs',
  ]) {
    writeFileSync(
      path.join(root, 'scripts', file),
      readFileSync(path.join(repo, 'scripts', file))
    );
  }
  symlinkSync(
    path.join(repo, 'node_modules'),
    path.join(web, 'node_modules'),
    'dir'
  );
  writeFileSync(path.join(root, '.gitignore'), 'node_modules/\ncoverage/\n');
  writeFileSync(path.join(root, 'package.json'), '{"private":true}');
  writeFileSync(
    path.join(root, 'pnpm-workspace.yaml'),
    'packages:\n  - apps/web\n'
  );
  writeFileSync(
    path.join(web, 'package.json'),
    JSON.stringify({
      name: '@jovie/web',
      type: 'module',
      scripts: {
        'test:coverage': `node ${JSON.stringify(vitest)} run --config vitest.config.mjs --coverage`,
      },
    })
  );
  writeFileSync(
    path.join(web, 'vitest.config.mjs'),
    `export default {
    test: { environment: 'node', include: ['probe.test.mjs'],
      coverage: { provider: 'v8', include: ['probe.mjs'], reporter: ['json'], reportsDirectory: 'coverage' }
    }
  };`
  );
  writeFileSync(
    path.join(web, 'probe.test.mjs'),
    `
    import { test, expect } from 'vitest';
    import { answer } from './probe.mjs';
    test('reports the actual answer', async () => {
      if (process.env.JOVIE_COVERAGE_HOLDER === '1') {
        await new Promise(resolve => {
          process.once('SIGUSR2', resolve);
          process.stdout.write('coverage-holder-ready:' + process.pid + '\\n');
        });
      }
      expect(answer()).toBe(42);
    });
  `
  );
  const git = args => {
    const r = spawnSync('git', args, { cwd: root, env, encoding: 'utf8' });
    assert.equal(r.status, 0, r.stdout + r.stderr);
    return r.stdout.trim();
  };
  git(['init', '-q']);
  git(['config', 'user.name', 'Fixture']);
  git(['config', 'user.email', 'fixture@example.test']);
  writeFileSync(
    path.join(web, 'probe.mjs'),
    'export function answer() { return 41; }\n'
  );
  git(['add', '.']);
  git(['commit', '-qm', 'base']);
  const base = git(['rev-parse', 'HEAD']);
  writeFileSync(
    path.join(web, 'probe.mjs'),
    `export function answer() { return ${answer}; }\n` +
      (uncovered
        ? `export function neverCalled() {
      const missing = 1;
      const proof = missing + 1;
      return proof;
    }\n`
        : '')
  );
  git(['add', '.']);
  git(['commit', '-qm', 'change']);
  return { root, web, base, head: git(['rev-parse', 'HEAD']) };
}

test('JOV-9722: a live shared coverage owner cannot block or lose evidence to another preflight', {
  skip: process.platform === 'win32',
}, async () => {
  const f = fixture();
  const holder = spawn(
    process.execPath,
    [
      vitest,
      'run',
      '--config',
      'vitest.config.mjs',
      '--coverage',
      '--testTimeout=30000',
    ],
    {
      cwd: f.web,
      env: { ...env, JOVIE_COVERAGE_HOLDER: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  );
  const closed = once(holder, 'close');
  let worker;
  let output = '';
  const observed = chunk => {
    output += chunk;
  };
  holder.stdout.on('data', observed);
  holder.stderr.on('data', observed);
  try {
    worker = await new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`Holder did not start: ${output}`)),
        10000
      );
      holder.once('error', reject);
      holder.once('close', code =>
        reject(new Error(`Holder exited ${code}: ${output}`))
      );
      holder.stdout.on('data', () => {
        const match = output.match(/coverage-holder-ready:(\d+)/);
        if (match) {
          clearTimeout(timer);
          resolve(Number(match[1]));
        }
      });
    });
    const retained = path.join(
      f.web,
      'coverage',
      'retained-owner-evidence.txt'
    );
    writeFileSync(retained, 'owned by the still-running coverage invocation');
    const result = await runPreflightCoverage({
      cwd: f.root,
      env,
      base: f.base,
      head: f.head,
      sh,
      hostSlotted: command => command,
    });
    assert.equal(result.code, 0, result.out);
    assert.match(
      result.out,
      /Changed-line coverage: 1\/1 \(100%; required 60%\)/
    );
    assert.equal(holder.exitCode, null);
    assert.equal(
      readFileSync(retained, 'utf8'),
      'owned by the still-running coverage invocation'
    );
  } finally {
    if (worker) {
      try {
        process.kill(worker, 'SIGUSR2');
      } catch {}
    } else holder.kill('SIGTERM');
    await closed;
    rmSync(f.root, { recursive: true, force: true });
  }
});

test('isolated reports preserve actual Vitest failures', async () => {
  const f = fixture({ answer: 43 });
  try {
    const result = await runPreflightCoverage({
      cwd: f.root,
      env,
      base: f.base,
      head: f.head,
      sh,
      hostSlotted: command => command,
    });
    assert.notEqual(result.code, 0, result.out);
    assert.match(result.out, /expected 43 to be 42/);
    assert.doesNotMatch(result.out, /Changed-line coverage:/);
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});

test('the existing changed-line verifier still rejects coverage below its unchanged floor', async () => {
  const f = fixture({ uncovered: true });
  try {
    const result = await runPreflightCoverage({
      cwd: f.root,
      env,
      base: f.base,
      head: f.head,
      sh,
      hostSlotted: command => command,
    });
    assert.notEqual(result.code, 0, result.out);
    assert.match(result.out, /Changed-line coverage:.*required 60%/);
    assert.doesNotMatch(result.out, /100%; required 60%/);
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});

test('no changed executable source remains a named skip, not a coverage pass', async () => {
  const f = fixture();
  try {
    const result = await runPreflightCoverage({
      cwd: f.root,
      env,
      base: f.head,
      head: f.head,
      sh,
      hostSlotted: command => command,
    });
    assert.equal(result.code, 0);
    assert.equal(result.skip, 'no coverable web product source');
    assert.doesNotMatch(result.out, /Changed-line coverage:/);
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});

test('an unreadable exact base remains a planning failure', async () => {
  const f = fixture();
  try {
    const result = await runPreflightCoverage({
      cwd: f.root,
      env,
      base: '0'.repeat(40),
      head: f.head,
      sh,
      hostSlotted: command => command,
    });
    assert.equal(result.code, 1, result.out);
    assert.doesNotMatch(result.out, /Changed-line coverage:/);
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});

test('minimal planner output and a spaced temporary root keep real coverage and cleanup working', async () => {
  const f = fixture();
  const reportRoot = path.join(f.root, 'report storage');
  mkdirSync(reportRoot);
  const execute = async (command, options) => {
    const result = await sh(command, options);
    if (command.endsWith('--plan') && result.code === 0) {
      const plan = JSON.parse(result.out.trim());
      delete plan.coverageInclude;
      delete plan.relatedTests;
      return { ...result, out: JSON.stringify(plan) };
    }
    return result;
  };
  try {
    const result = await runPreflightCoverage({
      cwd: f.root,
      env: { ...env, TMPDIR: reportRoot },
      base: f.base,
      head: f.head,
      sh: execute,
      hostSlotted: command => command,
    });
    assert.equal(result.code, 0, result.out);
    assert.match(
      result.out,
      /Changed-line coverage: 1\/1 \(100%; required 60%\)/
    );
    assert.deepEqual(
      readdirSync(reportRoot).filter(name =>
        name.startsWith('preflight-coverage-')
      ),
      []
    );
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});
