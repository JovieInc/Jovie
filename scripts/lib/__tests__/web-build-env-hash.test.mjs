import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { load } from 'js-yaml';
import { buildEnvHash } from '../../ci/web-build-env-hash.mjs';

const options = { lockfile: 'fixed lock inputs', nodeMajor: '24' };
const hash = env => buildEnvHash(env, options);
test('hash is sorted, includes all NEXT/E2E/config inputs and excludes Turbo transport', () => {
  const env = {
    NEXT_PUBLIC_FLAG: 'off',
    NEXT_DISABLE_TOOLBAR: '1',
    E2E_PERSONA: 'a',
  };
  assert.equal(
    hash(env),
    hash({
      E2E_PERSONA: 'a',
      NEXT_DISABLE_TOOLBAR: '1',
      NEXT_PUBLIC_FLAG: 'off',
    })
  );
  for (const key of [
    'NEXT_PUBLIC_FLAG',
    'NEXT_DISABLE_TOOLBAR',
    'NEXT_NEW_INPUT',
    'E2E_PERSONA',
    'DATABASE_URL',
    'PUBLIC_NOAUTH_SMOKE',
    'VERCEL_ENV',
    'CI',
  ])
    assert.notEqual(hash(env), hash({ ...env, [key]: 'changed' }), key);
  assert.equal(
    hash(env),
    hash({
      ...env,
      TURBO_CACHE: 'local:r',
      TURBO_ENGINE_READ_ONLY: '1',
      TURBO_TOKEN: 'transport-only',
    })
  );
  assert.notEqual(hash({}), hash({ NEXT_PUBLIC_FLAG: '' }));
  assert.equal(hash({}), hash({ DATABASE_URL: '' }));
  assert.notEqual(
    hash(env),
    buildEnvHash(env, { ...options, nodeMajor: '25' })
  );
  assert.notEqual(
    hash(env),
    buildEnvHash(env, { ...options, lockfile: 'changed' })
  );
});

test('CLI blocks flag drift, wrong SHA/profile/attempt and missing or corrupt manifests', () => {
  const root = resolve(import.meta.dirname, '../../..');
  const fixture = mkdtempSync(join(tmpdir(), 'web-build-manifest-'));
  const sha = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: root,
    encoding: 'utf8',
  }).trim();
  const gitDir = execFileSync('git', ['rev-parse', '--absolute-git-dir'], {
    cwd: root,
    encoding: 'utf8',
  }).trim();
  const env = {
    PATH: process.env.PATH,
    GIT_DIR: gitDir,
    GITHUB_SHA: sha,
    GITHUB_RUN_ID: '100',
    GITHUB_RUN_ATTEMPT: '2',
    NEXT_PUBLIC_FLAG: 'off',
    NEXT_DISABLE_TOOLBAR: '1',
  };
  const file = join(fixture, 'apps/web/.next/jovie-build-manifest.json');
  const run = (mode, changes = {}, profile = 'public') =>
    spawnSync(
      process.execPath,
      [join(root, 'scripts/ci/web-build-env-hash.mjs'), mode, profile],
      { cwd: fixture, env: { ...env, ...changes }, encoding: 'utf8' }
    );
  const reject = (result, reason) => {
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(result.stderr, /::error::/);
    assert.match(result.stderr, reason);
  };
  try {
    mkdirSync(join(fixture, 'apps/web/.next'), { recursive: true });
    writeFileSync(join(fixture, 'pnpm-lock.yaml'), options.lockfile);
    reject(run('verify'), /ENOENT/);
    assert.equal(run('write').status, 0);
    const manifest = JSON.parse(readFileSync(file, 'utf8'));
    assert.deepEqual(Object.keys(manifest), [
      'sha',
      'envHash',
      'profile',
      'runId',
      'runAttempt',
    ]);
    assert.equal(run('verify').status, 0);
    for (const change of [
      { NEXT_PUBLIC_FLAG: 'on' },
      { NEXT_DISABLE_TOOLBAR: '0' },
    ])
      reject(run('verify', change), /envHash mismatch/);
    reject(run('verify', { GITHUB_SHA: 'f'.repeat(40) }), /exact GITHUB_SHA/);
    writeFileSync(file, JSON.stringify({ ...manifest, sha: 'e'.repeat(40) }));
    reject(run('verify'), /sha mismatch/);
    writeFileSync(file, JSON.stringify(manifest));
    reject(run('verify', {}, 'visual'), /profile mismatch/);
    reject(run('verify', { GITHUB_RUN_ID: '101' }), /runId mismatch/);
    reject(run('verify', { GITHUB_RUN_ATTEMPT: '3' }), /runAttempt mismatch/);
    writeFileSync(file, 'not json');
    reject(run('verify'), /JSON/);
    // Exercise the real consumer shell, including tar and the verifier. A
    // present artifact with a mismatched env or missing tar must never reach
    // the rebuild path. This is independent of Turbo or Actions caching.
    const workflow = load(
      readFileSync(join(root, '.github/workflows/ci.yml'), 'utf8')
    );
    const extract = workflow.jobs['ci-smoke-required'].steps.find(
      s => s.name === 'Extract or rebuild for smoke tests'
    ).run;
    const temp = join(fixture, 'temp');
    const download = join(temp, 'nextjs-build-download');
    const archive = join(download, 'nextjs-build.tar');
    mkdirSync(download, { recursive: true });
    mkdirSync(join(fixture, 'scripts/ci'), { recursive: true });
    copyFileSync(
      join(root, 'scripts/ci/web-build-env-hash.mjs'),
      join(fixture, 'scripts/ci/web-build-env-hash.mjs')
    );
    assert.equal(run('write', {}, 'public').status, 0);
    mkdirSync(join(fixture, 'apps/web/.next/cache'), { recursive: true });
    writeFileSync(
      join(fixture, 'apps/web/.next/cache/sentinel'),
      'cache must not travel'
    );
    execFileSync('tar', [
      '-cf',
      archive,
      '--exclude=.next/cache',
      '-C',
      join(fixture, 'apps/web'),
      '.next',
    ]);
    const contents = execFileSync('tar', ['-tf', archive], {
      encoding: 'utf8',
    });
    assert.ok(contents.includes('.next/jovie-build-manifest.json'));
    assert.ok(!contents.includes('.next/cache'));
    const consume = changes =>
      spawnSync('bash', ['-e', '-c', extract], {
        cwd: fixture,
        env: { ...env, RUNNER_TEMP: temp, ...changes },
        encoding: 'utf8',
      });
    // Two consumers of the very same archive independently accept the hash.
    assert.equal(consume({}).status, 0);
    assert.equal(consume({}).status, 0);
    const changed = consume({ NEXT_DISABLE_TOOLBAR: '0' });
    reject(changed, /envHash mismatch/);
    assert.ok(!changed.stdout.includes('rebuilding'));
    // Malformed or manifest-less PRESENT archives also fail without fallback.
    for (const content of ['not json', null]) {
      if (content === null) rmSync(file);
      else writeFileSync(file, content);
      execFileSync('tar', [
        '-cf',
        archive,
        '-C',
        join(fixture, 'apps/web'),
        '.next',
      ]);
      reject(consume({}), content === null ? /ENOENT/ : /JSON/);
    }
    rmSync(archive);
    const missingTar = consume({});
    assert.notEqual(missingTar.status, 0);
    assert.ok(!missingTar.stdout.includes('rebuilding'));
    rmSync(download, { recursive: true });
    const absent = consume({});
    assert.equal(absent.status, 0);
    assert.match(
      absent.stdout,
      /::warning::Web build artifact absent; rebuilding/
    );
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});
