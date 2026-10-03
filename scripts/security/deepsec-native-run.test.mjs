import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, test } from 'node:test';
import {
  boundedNativeCommand,
  nativeSourceState,
  runNativeSubscriptionScan,
} from './deepsec-native-run.mjs';

const roots = [];
afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});
const target = 'apps/web/lib/auth/require-auth.ts';
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'native-scan-test-'));
  roots.push(root);
  const sourceRoot = join(root, 'source'),
    workspace = join(root, 'scanner');
  mkdirSync(sourceRoot);
  mkdirSync(dirname(join(sourceRoot, target)), { recursive: true });
  writeFileSync(
    join(sourceRoot, target),
    'export function requireAuth() { return true; }\n'
  );
  const git = args =>
    execFileSync('git', ['-C', sourceRoot, ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  git(['init', '--quiet']);
  git(['remote', 'add', 'origin', 'https://github.com/JovieInc/Jovie.git']);
  git(['add', '.']);
  git([
    '-c',
    'user.name=Fixture',
    '-c',
    'user.email=fixture@example.test',
    'commit',
    '--quiet',
    '-m',
    'fixture',
  ]);
  const headSha = git(['rev-parse', 'HEAD']);
  const input = {
    sourceRoot,
    workspace,
    headSha,
    files: [target],
    repository: 'JovieInc/Jovie',
    headRepository: 'JovieInc/Jovie',
  };
  const calls = [];
  let processResult = {
    status: 0,
    stdout:
      'Scanning 1 file(s)…\nProcessing complete. Run: native-fixture\n  Analyses: 1\n  Findings: 0\nNo findings.\n',
  };
  let findings = [];
  const execute = async (command, options) => {
    calls.push({ command, options });
    if (command[1] === '--version') return { status: 0, stdout: '2.3.10\n' };
    if (command[0] === 'codex')
      return { status: 0, stderr: 'Logged in using ChatGPT\n' };
    if (command[1] === 'process') return processResult;
    writeFileSync(join(workspace, 'findings.json'), JSON.stringify(findings));
    return { status: 0 };
  };
  return {
    input,
    calls,
    git,
    execute,
    setProcess: result => {
      processResult = result;
    },
    setFindings: value => {
      findings = value;
    },
  };
}

test('runs from a trusted fresh workspace with native-only credentials and bounded commands', async () => {
  const f = fixture();
  const result = await runNativeSubscriptionScan(f.input, {
    execute: f.execute,
    environment: {
      PATH: '/native/bin',
      HOME: '/native/home',
      HTTPS_PROXY: 'http://proxy:8080',
      NODE_EXTRA_CA_CERTS: '/trusted/runtime-ca.pem',
      OPENAI_API_KEY: 'fixture',
      AI_GATEWAY_API_KEY: 'fixture',
      GH_TOKEN: 'fixture',
      LINEAR_API_KEY: 'fixture',
      NODE_OPTIONS: 'fixture',
      DEEPSEC_INSIDE_SANDBOX: '1',
    },
  });
  assert.equal(result.receipt.status, 'clean');
  assert.equal(result.receipt.headSha, f.input.headSha);
  assert.deepEqual(
    f.calls.map(c => c.command[1]),
    ['--version', 'login', 'process', 'export']
  );
  for (const { options } of f.calls) {
    assert.deepEqual(options.env, {
      PATH: '/native/bin',
      HOME: '/native/home',
      HTTPS_PROXY: 'http://proxy:8080',
      NODE_EXTRA_CA_CERTS: '/trusted/runtime-ca.pem',
    });
    assert.equal(options.cwd, f.input.workspace);
  }
  assert.equal(f.calls[2].options.timeoutMs, 720_000);
  assert.equal(f.calls[2].command.includes('--ai-api-key-env'), false);
  assert.match(
    readFileSync(join(f.input.workspace, 'deepsec.config.mjs'), 'utf8'),
    /"mode":"local","provider":"local"/
  );
  assert.equal(
    readFileSync(join(f.input.workspace, 'files.txt'), 'utf8'),
    target + '\n'
  );
});

test('exports nullable-issue findings without inventing a tracking issue', async () => {
  const f = fixture();
  f.setProcess({
    status: 1,
    stdout:
      'Scanning 1 file(s)…\nProcessing complete. Run: native-fixture\n  Analyses: 1\n  Findings: 1\n1 new finding(s) — exiting 1\n',
  });
  f.setFindings([
    {
      metadata: {
        projectId: 'jovie',
        filePath: target,
        vulnSlug: 'auth-boundary',
        lineNumbers: [1],
        issue: null,
      },
    },
  ]);
  const result = await runNativeSubscriptionScan(f.input, {
    execute: f.execute,
  });
  assert.equal(result.receipt.status, 'findings');
  assert.equal(result.findings[0].metadata.issue, null);
});

test('rejects dirty, foreign, symlinked and stale-head source before any scanner command', async () => {
  for (const mutate of [
    f => {
      writeFileSync(join(f.input.sourceRoot, target), 'changed');
    },
    f => {
      writeFileSync(join(f.input.sourceRoot, '.env'), 'fixture');
    },
    f => {
      f.git([
        'remote',
        'set-url',
        'origin',
        'https://github.com/foreign/repo.git',
      ]);
    },
    f => {
      f.input.headSha = 'a'.repeat(40);
    },
    f => {
      const link = join(dirname(f.input.sourceRoot), 'linked');
      symlinkSync(f.input.sourceRoot, link, 'dir');
      f.input.sourceRoot = link;
    },
  ]) {
    const f = fixture();
    mutate(f);
    await assert.rejects(
      runNativeSubscriptionScan(f.input, { execute: f.execute })
    );
    assert.equal(f.calls.length, 0);
  }
});

test('rejects ignored dependencies in the isolated source before scanner admission', async () => {
  const f = fixture();
  writeFileSync(join(f.input.sourceRoot, '.gitignore'), 'node_modules/\n');
  f.git(['add', '.gitignore']);
  f.git([
    '-c',
    'user.name=Fixture',
    '-c',
    'user.email=fixture@example.test',
    'commit',
    '--quiet',
    '-m',
    'ignore dependencies',
  ]);
  f.input.headSha = f.git(['rev-parse', 'HEAD']);
  mkdirSync(join(f.input.sourceRoot, 'node_modules'));
  writeFileSync(
    join(f.input.sourceRoot, 'node_modules', 'untracked.js'),
    'mutable tool code'
  );
  await assert.rejects(
    runNativeSubscriptionScan(f.input, { execute: f.execute }),
    /clean exact-head source/
  );
  assert.equal(f.calls.length, 0);
});

test('rejects retained or symlinked scanner workspaces rather than mixing stale findings', async () => {
  for (const linked of [false, true]) {
    const f = fixture();
    mkdirSync(f.input.workspace);
    if (linked) {
      const link = f.input.workspace + '-link';
      symlinkSync(f.input.workspace, link, 'dir');
      f.input.workspace = link;
    } else writeFileSync(join(f.input.workspace, 'findings.json'), '[]');
    await assert.rejects(
      runNativeSubscriptionScan(f.input, { execute: f.execute }),
      /empty real scanner workspace/
    );
    assert.equal(f.calls.length, 0);
  }
});

test('source mutation during scanning cannot produce an export or a clean receipt', async () => {
  const f = fixture();
  await assert.rejects(
    runNativeSubscriptionScan(f.input, {
      execute: async (command, options) => {
        if (command[1] === 'process')
          writeFileSync(join(f.input.sourceRoot, target), 'changed by scanner');
        return f.execute(command, options);
      },
    }),
    /source changed/
  );
  assert.equal(
    f.calls.some(c => c.command[1] === 'export'),
    false
  );
});

test('a source mutation during export is rejected at the final receipt boundary', async () => {
  const f = fixture();
  await assert.rejects(
    runNativeSubscriptionScan(f.input, {
      execute: async (command, options) => {
        const result = await f.execute(command, options);
        if (command[1] === 'export')
          writeFileSync(
            join(f.input.sourceRoot, target),
            'changed during export'
          );
        return result;
      },
    }),
    /source changed/
  );
});

test('unknown auth, version drift, export errors, malformed data and partial scans fail closed', async () => {
  for (const kind of [
    'auth',
    'version',
    'export',
    'json',
    'signal',
    'quota',
    'missing',
    'symlink',
    'oversize',
  ]) {
    const f = fixture();
    const execute = async (command, options) => {
      if (kind === 'auth' && command[0] === 'codex')
        return { status: 0, stdout: 'Logged in using an API key' };
      if (kind === 'version' && command[1] === '--version')
        return { status: 0, stdout: '2.3.11' };
      if (command[1] === 'process' && kind === 'signal')
        return { status: null, signal: 'SIGKILL', stdout: '' };
      if (command[1] === 'process' && kind === 'quota')
        return { status: 1, stdout: 'quota exhausted' };
      const result = await f.execute(command, options);
      if (command[1] === 'export') {
        const path = join(f.input.workspace, 'findings.json');
        if (kind === 'export') return { status: 1 };
        if (kind === 'json') writeFileSync(path, '{');
        if (kind === 'missing') rmSync(path);
        if (kind === 'symlink') {
          rmSync(path);
          symlinkSync(join(f.input.sourceRoot, target), path);
        }
        if (kind === 'oversize')
          writeFileSync(path, ' '.repeat(4 * 1024 * 1024 + 1));
      }
      return result;
    };
    await assert.rejects(runNativeSubscriptionScan(f.input, { execute }));
  }
});

test('tracked symlinks and unavailable git metadata cannot certify source bytes', () => {
  const f = fixture();
  assert.throws(() => nativeSourceState(f.input.sourceRoot, ['missing.ts']));
  rmSync(join(f.input.sourceRoot, target));
  symlinkSync(
    join(f.input.sourceRoot, '.git', 'HEAD'),
    join(f.input.sourceRoot, target)
  );
  assert.throws(
    () => nativeSourceState(f.input.sourceRoot, [target]),
    /regular tracked security targets/
  );
});

test('bounded executor captures actual stdout/stderr and reports missing executables', async () => {
  const options = { cwd: tmpdir(), env: process.env, timeoutMs: 5_000 };
  const completed = await boundedNativeCommand(
    [
      process.execPath,
      '-e',
      "process.stdout.write('done');process.stderr.write('diagnostic')",
    ],
    options
  );
  assert.equal(completed.status, 0);
  assert.equal(completed.stdout, 'done');
  assert.equal(completed.stderr, 'diagnostic');
  const missing = await boundedNativeCommand(
    ['/nonexistent-native-test-command'],
    options
  );
  assert.ok(missing.error);
  assert.notEqual(missing.status, 0);
  assert.throws(() =>
    boundedNativeCommand(['unused'], { ...options, timeoutMs: 0 })
  );
  assert.throws(() =>
    boundedNativeCommand(['unused'], { ...options, maxOutputBytes: 0 })
  );
});

test('output overflow kills the real native process group', async () => {
  const result = await boundedNativeCommand(
    [
      process.execPath,
      '-e',
      "process.stdout.write('x'.repeat(4096));setInterval(()=>{},1000)",
    ],
    { cwd: tmpdir(), env: process.env, timeoutMs: 5_000, maxOutputBytes: 1024 }
  );
  assert.match(result.error.message, /output exceeded/);
  assert.notEqual(result.status, 0);
});

test('deadline kills both the real parent and its SDK-style descendant', async () => {
  const result = await boundedNativeCommand(
    [
      process.execPath,
      '-e',
      "const c=require('node:child_process').spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'});process.stdout.write(String(c.pid));setInterval(()=>{},1000)",
    ],
    { cwd: tmpdir(), env: process.env, timeoutMs: 500 }
  );
  assert.match(result.error.message, /timed out/);
  const pid = Number(result.stdout);
  assert.ok(pid > 0);
  try {
    assert.match(readFileSync(`/proc/${pid}/stat`, 'utf8'), /\) Z /);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
});
