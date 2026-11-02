import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

const SCRIPT = resolve('.github/actions/prime-node-toolcache/prime.sh');
const VERSION = '24.99.1';

// Hermetic: a file:// "nodejs.org" holding a fake node tarball, no network.
function fixture({ shaOverride } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'prime-node-'));
  const dist = join(dir, 'dist', `v${VERSION}`);
  mkdirSync(dist, { recursive: true });
  const stage = join(dir, 'stage', `node-v${VERSION}-linux-x64`, 'bin');
  mkdirSync(stage, { recursive: true });
  writeFileSync(join(stage, 'node'), '#!/bin/sh\necho fake\n');
  const name = `node-v${VERSION}-linux-x64.tar.gz`;
  const tar = spawnSync('tar', [
    '-czf',
    join(dist, name),
    '-C',
    join(dir, 'stage'),
    `node-v${VERSION}-linux-x64`,
  ]);
  assert.equal(tar.status, 0);
  const sha =
    shaOverride ??
    createHash('sha256')
      .update(readFileSync(join(dist, name)))
      .digest('hex');
  writeFileSync(join(dist, 'SHASUMS256.txt'), `${sha}  ${name}\n`);
  writeFileSync(join(dir, '.nvmrc'), `${VERSION}\n`);
  return { dir, cache: join(dir, 'toolcache') };
}

function run(f, extra = {}) {
  const result = spawnSync('bash', [SCRIPT], {
    cwd: f.dir,
    encoding: 'utf8',
    env: {
      PATH: process.env.PATH,
      RUNNER_TOOL_CACHE: f.cache,
      NODE_DIST_BASE: `file://${join(f.dir, 'dist')}`,
      PRIME_NODE_PLATFORM: 'linux',
      PRIME_NODE_ARCH: 'x86_64',
      NODE_VERSION_FILE: '.nvmrc',
      ...extra,
    },
  });
  return result;
}

test('primes the exact version where setup-node looks, without any GitHub call', () => {
  const f = fixture();
  try {
    const r = run(f);
    assert.equal(r.status, 0, r.stderr);
    const dest = join(f.cache, 'node', VERSION, 'x64');
    assert.ok(existsSync(join(dest, 'bin', 'node')), 'tarball extracted flat');
    assert.ok(existsSync(`${dest}.complete`), 'completion marker present');
    assert.match(r.stdout, /no GitHub API call/);
    // Second call is a no-op.
    assert.match(run(f).stdout, /already in the toolcache/);
  } finally {
    rmSync(f.dir, { recursive: true, force: true });
  }
});

test('a checksum mismatch installs nothing and never fails the job', () => {
  const f = fixture({ shaOverride: 'a'.repeat(64) });
  try {
    const r = run(f);
    assert.equal(r.status, 0);
    assert.match(r.stdout, /checksum mismatch/);
    assert.equal(
      existsSync(join(f.cache, 'node', VERSION, 'x64.complete')),
      false
    );
  } finally {
    rmSync(f.dir, { recursive: true, force: true });
  }
});

test('an unreachable mirror, a range, or a self-hosted runner leaves setup-node to resolve Node', () => {
  const f = fixture();
  try {
    const down = run(f, { NODE_DIST_BASE: `file://${join(f.dir, 'missing')}` });
    assert.equal(down.status, 0);
    assert.match(down.stdout, /download of .* failed/);

    writeFileSync(join(f.dir, '.nvmrc'), '24\n');
    const range = run(f);
    assert.equal(range.status, 0);
    assert.match(range.stdout, /not one exact version/);

    writeFileSync(join(f.dir, '.nvmrc'), `${VERSION}\n`);
    const selfHosted = run(f, {
      PRIME_NODE_PLATFORM: '',
      RUNNER_ENVIRONMENT: 'self-hosted',
    });
    assert.equal(selfHosted.status, 0);
    assert.match(selfHosted.stdout, /not a GitHub-hosted runner/);
    assert.equal(existsSync(join(f.cache, 'node')), false);
  } finally {
    rmSync(f.dir, { recursive: true, force: true });
  }
});

test('the composite action wires the script and the version file input', () => {
  const action = readFileSync(
    '.github/actions/prime-node-toolcache/action.yml',
    'utf8'
  );
  assert.match(action, /node-version-file:[\s\S]*default: \.nvmrc/);
  assert.match(action, /run: bash "\$GITHUB_ACTION_PATH\/prime\.sh"/);
});

test('sparse checkouts list the action files, never the directory (tests copy entries as files)', () => {
  // 2026-10-25: a directory entry ejected #23217 from three merge groups
  // (EISDIR in linear-sync-on-merge.test.mjs). PR CI never runs that lane.
  const dir = '.github/workflows';
  for (const name of readdirSync(dir)) {
    if (!/\.ya?ml$/.test(name)) continue;
    const text = readFileSync(join(dir, name), 'utf8');
    assert.doesNotMatch(
      text,
      /^ +\.github\/actions\/prime-node-toolcache\/?$/m,
      `${name} lists the action directory in a sparse checkout`
    );
    for (const block of text.match(/sparse-checkout: \|\n(?: +.+\n)+/g) ?? []) {
      if (!block.includes('prime-node-toolcache')) continue;
      assert.match(block, /prime-node-toolcache\/action\.yml/, name);
      assert.match(block, /prime-node-toolcache\/prime\.sh/, name);
    }
  }
});
