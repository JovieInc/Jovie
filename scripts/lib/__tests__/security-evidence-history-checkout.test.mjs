import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';

const { load } = createRequire(import.meta.url)('js-yaml');
/** @type {any} */
const workflow = load(
  readFileSync(
    resolve(
      import.meta.dirname,
      '../../../.github/workflows/source-validation.yml'
    ),
    'utf8'
  )
);
const security = workflow.jobs.security;
const checkout = security.steps.find(
  (/** @type {any} */ s) =>
    s.uses?.startsWith('actions/checkout@') &&
    s.with?.ref === '${{ github.event.pull_request.head.sha }}'
);
const prepare = security.steps.find(
  (/** @type {any} */ s) => s.name === 'Fetch full-blob source ancestry'
);
const env = {
  ...Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_'))
  ),
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_NO_LAZY_FETCH: '1',
  GIT_AUTHOR_NAME: 'fixture',
  GIT_AUTHOR_EMAIL: 'fixture@example.com',
  GIT_AUTHOR_DATE: '2026-01-01T00:00:00Z',
  GIT_COMMITTER_NAME: 'fixture',
  GIT_COMMITTER_EMAIL: 'fixture@example.com',
  GIT_COMMITTER_DATE: '2026-01-01T00:00:00Z',
};
/** @param {string} cwd @param {...string} args */
const git = (cwd, ...args) =>
  execFileSync('git', args, {
    maxBuffer: 256 * 1024 * 1024,
    cwd,
    env,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
/** @param {import('node:test').TestContext} t */
function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'security-history-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const seed = join(dir, 'seed');
  git(dir, 'init', '--quiet', '--initial-branch=main', seed);
  writeFileSync(join(seed, 'base.txt'), 'base');
  writeFileSync(
    join(seed, 'ancestor-only.txt'),
    'blob predating the scan base'
  );
  git(seed, 'add', '.');
  git(seed, 'commit', '-qm', 'ancestor');
  const ancestorBlob = git(seed, 'rev-parse', 'HEAD:ancestor-only.txt');
  git(seed, 'rm', '-q', 'ancestor-only.txt');
  git(seed, 'commit', '-qm', 'base');
  const common = git(seed, 'rev-parse', 'HEAD');
  git(seed, 'checkout', '-qb', 'feature');
  writeFileSync(
    join(seed, 'removed.txt'),
    'history-only blob required by scanners'
  );
  git(seed, 'add', '.');
  git(seed, 'commit', '-qm', 'add history-only file');
  const removedBlob = git(seed, 'rev-parse', 'HEAD:removed.txt');
  git(seed, 'rm', '-q', 'removed.txt');
  git(seed, 'commit', '-qm', 'remove history-only file');
  const head = git(seed, 'rev-parse', 'HEAD');
  git(seed, 'checkout', '-q', 'main');
  writeFileSync(join(seed, 'base-advance.txt'), 'target advanced');
  git(seed, 'add', '.');
  git(seed, 'commit', '-qm', 'advance target');
  const base = git(seed, 'rev-parse', 'HEAD');
  git(seed, 'checkout', '-qb', 'unrelated', common);
  writeFileSync(
    join(seed, 'unrelated.txt'),
    'unrelated branch must not be downloaded'
  );
  git(seed, 'add', '.');
  git(seed, 'commit', '-qm', 'unrelated branch');
  const unrelated = git(seed, 'rev-parse', 'HEAD');
  git(seed, 'tag', 'unrelated-tag');
  const origin = join(dir, 'origin.git');
  git(dir, 'clone', '--quiet', '--bare', seed, origin);
  const work = join(dir, 'work');
  git(dir, 'init', '--quiet', work);
  git(work, 'remote', 'add', 'origin', `file://${origin}`);
  // Keep these small fixtures loose so corruption tests can remove one blob.
  git(work, 'config', 'fetch.unpackLimit', '10000');
  // Execute the checkout's configured history policy, including the old wildcard fetch.
  if (checkout.with['fetch-depth'] === 0) {
    git(
      work,
      'fetch',
      '--quiet',
      '--tags',
      'origin',
      '+refs/heads/*:refs/remotes/origin/*'
    );
    git(work, 'checkout', '--quiet', '--detach', head);
  } else {
    git(work, 'fetch', '--quiet', '--no-tags', '--depth=1', 'origin', head);
    git(work, 'checkout', '--quiet', '--detach', 'FETCH_HEAD');
  }
  return {
    dir,
    work,
    origin,
    head,
    base,
    common,
    removedBlob,
    ancestorBlob,
    unrelated,
  };
}
/** @param {ReturnType<typeof fixture>} f @param {Record<string,string>} [overrides] */
function recover(f, overrides = {}) {
  return spawnSync('bash', ['-euo', 'pipefail', '-c', prepare?.run ?? ''], {
    cwd: f.work,
    encoding: 'utf8',
    env: {
      ...env,
      SOURCE_HEAD_SHA: f.head,
      TARGET_BASE_REF: 'main',
      ...overrides,
    },
    timeout: 15000,
  });
}
test('security checkout keeps full-blob head/base ancestry and removed-file objects without unrelated refs', t => {
  const f = fixture(t);
  const r = recover(f);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(git(f.work, 'rev-parse', 'HEAD'), f.head);
  assert.equal(git(f.work, 'rev-parse', '--is-shallow-repository'), 'false');
  assert.equal(git(f.work, 'merge-base', 'origin/main', 'HEAD'), f.common);
  assert.equal(
    git(f.work, 'cat-file', 'blob', f.removedBlob),
    'history-only blob required by scanners'
  );
  assert.match(
    git(f.work, 'log', '-p', `${f.common}..HEAD`),
    /history-only blob required by scanners/
  );
  git(f.work, 'rev-list', '--objects', '--missing=error', f.head, f.base);
  assert.notEqual(
    spawnSync('git', ['cat-file', '-e', f.unrelated], {
      maxBuffer: 256 * 1024 * 1024,
      cwd: f.work,
      env,
    }).status,
    0
  );
  assert.equal(git(f.work, 'tag', '--list'), '');
});
test('prepared ancestry can be cloned locally and read offline through the full scan range', t => {
  const f = fixture(t);
  const r = recover(f);
  assert.equal(r.status, 0, r.stderr);
  // TruffleHog clones file:// before it applies --since-commit/--branch.
  // The source must serve that clone without relying on the upstream origin.
  git(
    f.work,
    'remote',
    'set-url',
    'origin',
    `file://${join(f.dir, 'absent.git')}`
  );
  const scan = join(f.dir, 'scanner-clone');
  git(f.dir, 'clone', '--quiet', '--no-checkout', `file://${f.work}`, scan);
  assert.equal(git(scan, 'rev-parse', 'HEAD'), f.head);
  assert.equal(git(scan, 'rev-parse', '--is-shallow-repository'), 'false');
  assert.equal(
    git(scan, 'rev-list', `${f.common}..HEAD`),
    git(f.work, 'rev-list', `${f.common}..HEAD`)
  );
  git(scan, 'rev-list', '--objects', '--missing=error', f.head, f.common);
  assert.match(
    git(scan, 'log', '-p', `${f.common}..HEAD`),
    /history-only blob required by scanners/
  );
  assert.equal(
    git(scan, 'cat-file', 'blob', f.removedBlob),
    'history-only blob required by scanners'
  );
});
test('missing history-only blob fails preparation even when the current tree is readable', t => {
  const f = fixture(t);
  assert.equal(recover(f).status, 0);
  rmSync(
    join(
      f.work,
      '.git/objects',
      f.removedBlob.slice(0, 2),
      f.removedBlob.slice(2)
    )
  );
  // The missing file was added and removed inside the scanned range. Checking
  // only HEAD's tree would pass and silently lose the commit that introduced it.
  git(f.work, 'cat-file', 'blob', 'HEAD:base.txt');
  const r = recover(f);
  assert.notEqual(r.status, 0, r.stdout);
  assert.match(r.stderr, /missing|bad object|unable to read/i);
});
test('range-only blob completeness is insufficient for the scanner local clone', t => {
  const f = fixture(t);
  assert.equal(recover(f).status, 0);
  // This blob predates base..HEAD, but upload-pack still needs it to serve
  // TruffleHog's unfiltered clone. A range-only proof would incorrectly pass.
  rmSync(
    join(
      f.work,
      '.git/objects',
      f.ancestorBlob.slice(0, 2),
      f.ancestorBlob.slice(2)
    )
  );
  git(
    f.work,
    'rev-list',
    '--objects',
    '--missing=error',
    `${f.common}..${f.head}`
  );
  const clone = spawnSync(
    'git',
    [
      'clone',
      '--quiet',
      '--no-checkout',
      `file://${f.work}`,
      join(f.dir, 'scanner-clone'),
    ],
    { env, encoding: 'utf8', timeout: 15000 }
  );
  assert.notEqual(clone.status, 0, clone.stdout);
  assert.match(clone.stderr, /missing|bad object|unable to read|corrupt/i);
  assert.notEqual(recover(f).status, 0);
});
test('already complete unfiltered source history is accepted without moving HEAD', t => {
  const f = fixture(t);
  if (git(f.work, 'rev-parse', '--is-shallow-repository') === 'true')
    git(
      f.work,
      'fetch',
      '--quiet',
      '--unshallow',
      '--no-tags',
      'origin',
      f.head
    );
  const r = recover(f);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(git(f.work, 'rev-parse', 'HEAD'), f.head);
  assert.equal(git(f.work, 'rev-parse', 'origin/main'), f.base);
});
test('missing target branch fails before scanning', t => {
  const f = fixture(t);
  const r = recover(f, { TARGET_BASE_REF: 'missing-target' });
  assert.notEqual(r.status, 0);
});
test('mismatched expected head fails before fetching or scanning', t => {
  const f = fixture(t);
  const r = recover(f, { SOURCE_HEAD_SHA: f.base });
  assert.notEqual(r.status, 0);
});
test('malformed target ref fails closed', t => {
  const f = fixture(t);
  const r = recover(f, { TARGET_BASE_REF: 'main:refs/heads/injected' });
  assert.notEqual(r.status, 0);
});
test('partial object stores are refused instead of claiming complete scanner history', t => {
  const f = fixture(t);
  git(f.work, 'config', 'remote.origin.promisor', 'true');
  assert.notEqual(recover(f).status, 0);
});
test('legacy partial-clone extension is refused even without the origin promisor flag', t => {
  const f = fixture(t);
  git(f.work, 'config', 'extensions.partialClone', 'origin');
  assert.notEqual(recover(f).status, 0);
});
test('unavailable origin fails before scanning and preserves source HEAD', t => {
  const f = fixture(t);
  git(
    f.work,
    'remote',
    'set-url',
    'origin',
    `file://${join(f.dir, 'absent.git')}`
  );
  assert.notEqual(recover(f).status, 0);
  assert.equal(git(f.work, 'rev-parse', 'HEAD'), f.head);
});
test('scanner policy, credentials boundary and original job deadline remain blocking', () => {
  assert.equal(checkout.with['fetch-depth'], 1);
  assert.equal(checkout.with.filter, undefined);
  assert.equal(checkout.with['persist-credentials'], false);
  assert.equal(security['timeout-minutes'], 20);
  const scan = security.steps.find(
    (/** @type {any} */ s) => s.name === 'Scan the exact source diff'
  );
  assert.match(scan.run, /scan-secrets\.sh ci-pr "\$base_sha"/);
  assert.equal(scan.env.RELEASE_DOWNLOAD_TOKEN, '${{ github.token }}');
  assert.ok(prepare && !prepare['continue-on-error']);
  assert.ok(security.steps.indexOf(prepare) < security.steps.indexOf(scan));
  for (const [file, command] of [
    ['../../../.github/workflows/ci.yml', 'scan-secrets.sh ci-pr "$BASE_SHA"'],
    [
      '../../../.github/workflows/security.yml',
      'scan-secrets.sh ci-pr "origin/${{ github.base_ref }}"',
    ],
    [
      '../../../.github/workflows/security.yml',
      'scan-secrets.sh ci-pr-trufflehog "origin/${{ github.base_ref }}"',
    ],
  ]) {
    const text = readFileSync(resolve(import.meta.dirname, file), 'utf8');
    const at = text.indexOf(command);
    assert.notEqual(at, -1, `${file} ${command}`);
    const step = text.slice(text.lastIndexOf('\n      - ', at), at);
    assert.match(
      step,
      /RELEASE_DOWNLOAD_TOKEN: \$\{\{ github\.token \}\}/,
      file
    );
  }
});
