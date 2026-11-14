import { spawn, spawnSync } from 'node:child_process';
import {
  existsSync,
  globSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  mutationRunSucceeded,
  runMutationHarness,
} from '../mutation-lifecycle.mjs';

const REPO = resolve(import.meta.dirname, '../../..');
const ORIGINAL = 'export const value = true;\n';
const INSTRUMENTED =
  'function stryNS_fixture() { return globalThis.__stryker__; }\n';
const roots = [];
const owned = [];
const alive = pid => {
  const result = spawnSync('ps', ['-p', String(pid), '-o', 'stat='], {
    encoding: 'utf8',
  });
  if (result.status === 1) return false;
  if (result.status !== 0)
    throw new Error('test process observation unavailable');
  return !/^[ZX]/u.test(result.stdout.trim());
};
afterEach(() => {
  for (const pid of owned.splice(0)) {
    if (alive(pid)) {
      try {
        process.kill(-pid, 'SIGKILL');
      } catch {
        /* already stopped */
      }
    }
  }
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'mutation-lifecycle-'));
  roots.push(root);
  writeFileSync(join(root, 'source.ts'), ORIGINAL);
  return root;
}
const waitFor = probe => vi.waitFor(probe, { interval: 10, timeout: 4000 });
const captured = root =>
  globSync('.stryker-tmp/sweep-*/recovery.json', { cwd: root });
function harness(root, { leaderExit = false, ignoreTerm = true } = {}) {
  const script = join(root, 'harness.cjs');
  writeFileSync(
    script,
    `
const { spawn } = require('node:child_process');
const fs = require('node:fs'); const path = require('node:path');
const root = ${JSON.stringify(root)};
const backup = path.join(process.env.STRYKER_TEMP_DIR, 'backup-fixture', 'source.ts');
fs.mkdirSync(path.dirname(backup), { recursive: true });
fs.writeFileSync(backup, fs.readFileSync(path.join(root, 'source.ts')));
fs.writeFileSync(path.join(root, 'source.ts'), ${JSON.stringify(INSTRUMENTED)});
${ignoreTerm ? `process.on('SIGTERM', () => fs.writeFileSync(path.join(root, 'term-saw-backup'), String(fs.existsSync(backup))));` : ''}
const child = spawn(process.execPath, ['-e', 'process.on("SIGTERM", () => {}); process.send("ready"); setInterval(() => {}, 1000)'], { stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
child.on('message', () => {
  const pidsPath = path.join(root, 'pids.json');
  fs.writeFileSync(pidsPath + '.tmp', JSON.stringify({ leader: process.pid, child: child.pid }));
  fs.renameSync(pidsPath + '.tmp', pidsPath);
  ${leaderExit ? `const timer = setInterval(() => { if (fs.existsSync(path.join(process.env.STRYKER_TEMP_DIR, 'recovery.json'))) { clearInterval(timer); process.exit(0); } }, 5);` : ''}
});
setInterval(() => {}, 1000);
`
  );
  return script;
}
const options = root => ({
  cwd: root,
  rootDir: root,
  sourcePath: join(root, 'source.ts'),
  timeoutMs: 2000,
  graceMs: 40,
  cleanupMs: 500,
});

describe('owned mutation cleanup', () => {
  it('accepts a completed clean harness and rejects startup failures without leaking listeners', async () => {
    const root = fixture();
    const listeners = process.listenerCount('SIGTERM');
    const success = await runMutationHarness(
      process.execPath,
      ['-e', 'process.exit(0)'],
      options(root)
    );
    expect(mutationRunSucceeded(success)).toBe(true);
    expect(existsSync(success.tempDir)).toBe(false);
    const missing = await runMutationHarness(
      join(root, 'missing-executable'),
      [],
      options(root)
    );
    expect(missing.error.code).toBe('ENOENT');
    expect(mutationRunSucceeded(missing)).toBe(false);
    expect(missing.cleanupProved).toBe(true);
    await expect(
      runMutationHarness(
        /** @type {string} */ (/** @type {unknown} */ (123)),
        [],
        options(root)
      )
    ).rejects.toThrow();
    expect(globSync('.stryker-tmp/sweep-*', { cwd: root })).toEqual([]);
    expect(process.listenerCount('SIGTERM')).toBe(listeners);
  });

  it('refuses already-instrumented input and overlapping in-place root writers', async () => {
    const abandoned = fixture();
    writeFileSync(join(abandoned, 'source.ts'), INSTRUMENTED);
    await expect(
      runMutationHarness(
        process.execPath,
        ['-e', 'process.exit(0)'],
        options(abandoned)
      )
    ).rejects.toThrow('already instrumented');
    expect(readFileSync(join(abandoned, 'source.ts'), 'utf8')).toBe(
      INSTRUMENTED
    );
    const root = fixture();
    const first = runMutationHarness(
      process.execPath,
      [harness(root, { ignoreTerm: false })],
      {
        ...options(root),
        timeoutMs: 5000,
      }
    );
    await waitFor(() => {
      expect(captured(root)).toHaveLength(1);
      expect(existsSync(join(root, 'pids.json'))).toBe(true);
    });
    const otherRoot = join(root, 'packages/other');
    mkdirSync(otherRoot, { recursive: true });
    const otherSource = join(otherRoot, 'other.ts');
    writeFileSync(otherSource, ORIGINAL);
    await expect(
      runMutationHarness(process.execPath, ['-e', 'process.exit(0)'], {
        ...options(root),
        rootDir: otherRoot,
        sourcePath: otherSource,
      })
    ).rejects.toThrow('worktree already owned');
    expect(readFileSync(otherSource, 'utf8')).toBe(ORIGINAL);
    const pids = JSON.parse(readFileSync(join(root, 'pids.json'), 'utf8'));
    process.kill(pids.leader, 'SIGTERM');
    expect((await first).cleanupProved).toBe(true);
    expect(readFileSync(join(root, 'source.ts'), 'utf8')).toBe(ORIGINAL);
  });

  it('never signals after a positively changed process identity, including the error fallback', async () => {
    const root = fixture();
    let samples = 0;
    const sendSignal = vi.fn();
    const run = await runMutationHarness(
      process.execPath,
      ['-e', 'setInterval(() => {}, 1000)'],
      {
        ...options(root),
        timeoutMs: 100,
        sampleGroup: pid => [
          { pid, started: samples++ === 0 ? 'original' : 'replacement' },
        ],
        sendSignal,
      }
    );
    owned.push(run.processGroup);
    expect(run.cleanupError.name).toBe('MutationIdentityChanged');
    expect(run.cleanupProved).toBe(false);
    expect(sendSignal).not.toHaveBeenCalled();
    expect(existsSync(run.tempDir)).toBe(true);
  });

  it.each(['additional', 'mismatched', 'symlink'])(
    'preserves unknown %s recovery files even when the source is already original',
    async kind => {
      const root = fixture();
      const source = `const fs=require('node:fs'), path=require('node:path');
const dir=path.join(process.env.STRYKER_TEMP_DIR,'backup-fixture');fs.mkdirSync(dir,{recursive:true});
${
  kind === 'symlink'
    ? `fs.symlinkSync(${JSON.stringify(join(root, 'source.ts'))},path.join(dir,'source.ts'));`
    : `fs.writeFileSync(path.join(dir,${JSON.stringify(kind === 'additional' ? 'other.ts' : 'source.ts')}),'different original');`
}`;
      const run = await runMutationHarness(
        process.execPath,
        ['-e', source],
        options(root)
      );
      expect(run.cleanupProved).toBe(false);
      expect(run.cleanupError.message).toContain('mismatched recovery backups');
      expect(existsSync(join(run.tempDir, 'backup-fixture'))).toBe(true);
      expect(readFileSync(join(root, 'source.ts'), 'utf8')).toBe(ORIGINAL);
    }
  );

  it('stops child and grandchild before restoring source and deleting only owned scratch', async () => {
    const root = fixture();
    const foreign = join(root, '.stryker-tmp', 'foreign-backup');
    mkdirSync(foreign, { recursive: true });
    writeFileSync(join(foreign, 'keep'), 'unrelated recovery');
    const unrelated = spawn(
      process.execPath,
      ['-e', 'setInterval(() => {}, 1000)'],
      {
        detached: true,
        stdio: 'ignore',
      }
    );
    owned.push(unrelated.pid);
    const run = await runMutationHarness(
      process.execPath,
      [harness(root)],
      options(root)
    );
    const pids = JSON.parse(readFileSync(join(root, 'pids.json'), 'utf8'));
    expect(run.timedOut).toBe(true);
    expect(run.cleanupProved).toBe(true);
    expect(mutationRunSucceeded(run)).toBe(false);
    expect(alive(pids.leader)).toBe(false);
    expect(alive(pids.child)).toBe(false); // Linux zombies are stopped, not claimed reaped.
    expect(alive(unrelated.pid)).toBe(true);
    expect(readFileSync(join(root, 'term-saw-backup'), 'utf8')).toBe('true');
    expect(readFileSync(join(root, 'source.ts'), 'utf8')).toBe(ORIGINAL);
    expect(existsSync(run.tempDir)).toBe(false);
    expect(readFileSync(join(foreign, 'keep'), 'utf8')).toBe(
      'unrelated recovery'
    );
  });

  it('drains descendants after a successful leader exit and rejects that incomplete run', async () => {
    const root = fixture();
    const run = await runMutationHarness(
      process.execPath,
      [harness(root, { leaderExit: true })],
      options(root)
    );
    const pids = JSON.parse(readFileSync(join(root, 'pids.json'), 'utf8'));
    expect(run.status).toBe(0);
    expect(run.error.message).toContain('live descendants');
    expect(run.cleanupProved).toBe(true);
    expect(alive(pids.child)).toBe(false);
    expect(readFileSync(join(root, 'source.ts'), 'utf8')).toBe(ORIGINAL);
    expect(mutationRunSucceeded(run)).toBe(false);
  });

  it('preserves a later edit even when it still contains a Stryker marker', async () => {
    const root = fixture();
    const result = runMutationHarness(
      process.execPath,
      [harness(root, { ignoreTerm: false })],
      {
        ...options(root),
        timeoutMs: 5000,
      }
    );
    await waitFor(() => {
      expect(captured(root)).toHaveLength(1);
      expect(existsSync(join(root, 'pids.json'))).toBe(true);
    });
    const pids = JSON.parse(readFileSync(join(root, 'pids.json'), 'utf8'));
    owned.push(pids.leader);
    const later = `${INSTRUMENTED}// unrelated writer's edit\n`;
    writeFileSync(join(root, 'source.ts'), later);
    process.kill(pids.leader, 'SIGTERM');
    const run = await result;
    expect(run.cleanupProved).toBe(false);
    expect(run.cleanupError.message).toContain(
      'differs from owned instrumentation snapshot'
    );
    expect(readFileSync(join(root, 'source.ts'), 'utf8')).toBe(later);
    expect(existsSync(join(run.tempDir, 'backup-fixture', 'source.ts'))).toBe(
      true
    );
    expect(mutationRunSucceeded(run)).toBe(false);
  });

  it('validates root ownership before source restoration and preserves a replacement lease', async () => {
    const root = fixture();
    const result = runMutationHarness(
      process.execPath,
      [harness(root, { ignoreTerm: false })],
      {
        ...options(root),
        timeoutMs: 5000,
      }
    );
    await waitFor(() => {
      expect(captured(root)).toHaveLength(1);
      expect(existsSync(join(root, 'pids.json'))).toBe(true);
    });
    const lease = join(root, '.stryker-tmp/sweep-owner/owner.json');
    writeFileSync(lease, 'replacement owner');
    const pids = JSON.parse(readFileSync(join(root, 'pids.json'), 'utf8'));
    process.kill(pids.leader, 'SIGTERM');
    const run = await result;
    expect(run.cleanupProved).toBe(false);
    expect(run.cleanupError.message).toContain('root ownership changed');
    expect(readFileSync(join(root, 'source.ts'), 'utf8')).toBe(INSTRUMENTED);
    expect(readFileSync(lease, 'utf8')).toBe('replacement owner');
    expect(existsSync(join(run.tempDir, 'backup-fixture/source.ts'))).toBe(
      true
    );
  });

  it('handles SIGTERM through the same bounded recovery path', async () => {
    const root = fixture();
    const driver = join(root, 'driver.mjs');
    const helper = pathToFileURL(
      resolve(REPO, 'scripts/lib/mutation-lifecycle.mjs')
    ).href;
    const script = harness(root);
    writeFileSync(
      driver,
      `import { runMutationHarness, mutationRunSucceeded } from ${JSON.stringify(helper)};
import { writeFileSync } from 'node:fs';
const run = await runMutationHarness(process.execPath, [${JSON.stringify(script)}], ${JSON.stringify({ ...options(root), timeoutMs: 10000 })});
writeFileSync(${JSON.stringify(join(root, 'result.json'))}, JSON.stringify({ ...run, error: run.error?.message }));
process.exitCode = mutationRunSucceeded(run) ? 0 : 1;`
    );
    const child = spawn(process.execPath, [driver], {
      detached: true,
      stdio: 'ignore',
    });
    owned.push(child.pid);
    const exit = new Promise(resolveExit =>
      child.once('close', code => resolveExit(code))
    );
    await waitFor(() => expect(captured(root)).toHaveLength(1));
    process.kill(child.pid, 'SIGTERM');
    expect(await exit).toBe(1);
    const run = JSON.parse(readFileSync(join(root, 'result.json'), 'utf8'));
    expect(run.interrupted).toBe(true);
    expect(run.cleanupProved).toBe(true);
    expect(run.error).toContain('SIGTERM');
    expect(readFileSync(join(root, 'source.ts'), 'utf8')).toBe(ORIGINAL);
  });
});

it('preserves recovery state and stops the directly owned child when process evidence is unavailable', async () => {
  const root = fixture();
  const run = await runMutationHarness(
    process.execPath,
    ['-e', 'setInterval(() => {}, 1000)'],
    {
      ...options(root),
      sampleGroup: () => {
        throw new Error('mutation process-group snapshot unavailable');
      },
    }
  );
  expect(run.cleanupProved).toBe(false);
  expect(run.error.message).toContain('snapshot unavailable');
  expect(existsSync(run.tempDir)).toBe(true);
  await waitFor(() => expect(alive(run.processGroup)).toBe(false));
  expect(readFileSync(join(root, 'source.ts'), 'utf8')).toBe(ORIGINAL);
});

it('the actual sweep rejects a partial report from a failed harness and reports zero scored', () => {
  const root = fixture();
  const copied = new Set();
  const copyModule = rel => {
    if (copied.has(rel)) return;
    copied.add(rel);
    const source = readFileSync(join(REPO, rel), 'utf8');
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    writeFileSync(join(root, rel), source);
    for (const match of source.matchAll(
      /(?:from\s+|import\s*\()(['"])(\.[^'"]+)\1/gu
    )) {
      const child = relativeModule(rel, match[2]);
      if (/\.(mjs|ts)$/u.test(child)) copyModule(child);
    }
  };
  copyModule('scripts/mutation-sweep.mjs');
  writeFileSync(
    join(root, 'scripts/mutation-score-baseline.json'),
    JSON.stringify({ schemaVersion: 1, direction: 'lock_up', files: {} })
  );
  symlinkSync(join(REPO, 'node_modules'), join(root, 'node_modules'), 'dir');
  mkdirSync(join(root, 'packages/ui/atoms'), { recursive: true });
  writeFileSync(join(root, 'packages/ui/atoms/source.ts'), ORIGINAL);
  writeFileSync(
    join(root, 'packages/ui/atoms/source.test.ts'),
    "import { value } from './source';\n"
  );
  mkdirSync(join(root, 'scripts'), { recursive: true });
  writeFileSync(
    join(root, 'scripts/mutation-ui.mjs'),
    `import { mkdirSync, writeFileSync } from 'node:fs';
mkdirSync('packages/ui/reports/mutation/diff', {recursive:true});
writeFileSync('packages/ui/reports/mutation/diff/atoms_source.ts.json', JSON.stringify({files:{'atoms/source.ts':{mutants:[{status:'Killed',mutatorName:'BooleanLiteral',replacement:'false',location:{start:{line:1,column:22},end:{line:1,column:26}}}]}}}));
process.exitCode=1;`
  );
  const env = {
    ...process.env,
    MUTATION_MIN_MEM_GB: '0',
    MUTATION_MAX_LOAD: '1000000000',
    MUTATION_MIN_DISK_GB: '0',
  };
  for (const key of Object.keys(env))
    if (key.startsWith('GIT_')) delete env[key];
  for (const args of [
    ['init', '-q'],
    ['add', '.'],
    [
      '-c',
      'user.name=Fixture',
      '-c',
      'user.email=fixture@example.invalid',
      'commit',
      '-qm',
      'fixture',
    ],
  ]) {
    const git = spawnSync('git', args, { cwd: root, env, encoding: 'utf8' });
    expect(git.status, git.stderr).toBe(0);
  }
  const state = join(root, 'state.json');
  const output = join(root, 'outputs');
  const run = spawnSync(
    process.execPath,
    [
      'scripts/mutation-sweep.mjs',
      '--files',
      'packages/ui/atoms/source.ts',
      '--state',
      state,
      '--github-output',
      output,
    ],
    {
      cwd: root,
      env,
      encoding: 'utf8',
      timeout: 10000,
    }
  );
  expect(run.status, `${run.stdout}\n${run.stderr}`).toBe(1);
  expect(existsSync(state), `${run.stdout}\n${run.stderr}`).toBe(true);
  expect(
    JSON.parse(readFileSync(state, 'utf8')).modules[
      'packages/ui/atoms/source.ts'
    ]
  ).toMatchObject({ status: 'error', score: null });
  expect(readFileSync(output, 'utf8')).toContain('scored=0');
});

function relativeModule(parent, path) {
  return resolve(dirname(join(REPO, parent)), path).slice(REPO.length + 1);
}
