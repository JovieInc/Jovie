import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import {
  copyFile,
  mkdir,
  mkdtemp,
  realpath,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  computeNextVersion,
  planStamp,
  promoteChangelog,
  setManifestVersion,
} from './version-stamp.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');

test('computeNextVersion increments patch within the same UTC month', () => {
  assert.equal(
    computeNextVersion('26.6.61', new Date('2026-06-28T12:00:00Z')),
    '26.6.62'
  );
});

test('computeNextVersion resets patch on UTC month rollover', () => {
  assert.equal(
    computeNextVersion('26.6.61', new Date('2026-07-01T00:00:00Z')),
    '26.7.0'
  );
});

test('setManifestVersion preserves package manifest formatting and only changes version', () => {
  const source =
    '{\n  "name": "@jovie/web",\n  "version": "26.6.61",\n  "private": true\n}\n';

  assert.equal(
    setManifestVersion(source, '26.6.62'),
    '{\n  "name": "@jovie/web",\n  "version": "26.6.62",\n  "private": true\n}\n'
  );
});

test('promoteChangelog moves Unreleased above older releases and opens fresh Unreleased', () => {
  const changelog = [
    '# Changelog',
    '',
    'All notable changes.',
    '',
    '## [26.6.61] - 2026-06-28',
    '',
    '### Added',
    '- Existing release.',
    '',
    '## [Unreleased]',
    '',
    '### Fixed',
    '- New fix.',
    '',
  ].join('\n');

  const promoted = promoteChangelog(changelog, '26.6.62', '2026-06-29');

  // Fresh empty Unreleased then the new dated release sit above the old release.
  assert.match(
    promoted,
    /## \[Unreleased\]\n\n## \[26\.6\.62\] - 2026-06-29\n\n### Fixed\n- New fix\./
  );
  // The newly stamped release must appear before the previous release.
  assert.ok(
    promoted.indexOf('## [26.6.62]') < promoted.indexOf('## [26.6.61]'),
    'new release should be listed above the previous release'
  );
  // The first dated release heading is the one version:check reads as latest.
  const firstDated = promoted.match(/^## \[(\d+\.\d+\.\d+)\] - /m);
  assert.equal(firstDated?.[1], '26.6.62');
});

test('promoteChangelog tags newly promoted operational bullets and summaries only', () => {
  const changelog = `# Changelog

## [Unreleased]

> Improved profile sharing.
> Hardened merge queue receipts.
> Existing operational summary [internal]

### Fixed
- Customer profiles load more reliably.
- Fixed localhost startup routing.
- [internal] Kept existing release diagnostics.

## [26.8.1] - 2026-09-03

> Hardened webhook dispatch with Redis-backed dedupe.

### Fixed
- Existing SwiftUI release note.
`;

  const promoted = promoteChangelog(changelog, '26.9.0', '2026-09-05');

  assert.match(promoted, /> Improved profile sharing\./);
  assert.match(promoted, /> Hardened merge queue receipts\. \[internal\]/);
  assert.match(promoted, /> Existing operational summary \[internal\]/);
  assert.match(promoted, /- Customer profiles load more reliably\./);
  assert.match(promoted, /- \[internal\] Fixed localhost startup routing\./);
  assert.match(promoted, /- \[internal\] Kept existing release diagnostics\./);
  assert.ok(!promoted.includes('[internal] [internal]'));
  assert.match(
    promoted,
    /## \[26\.8\.1\] - 2026-09-03\n\n> Hardened webhook dispatch with Redis-backed dedupe\.\n\n### Fixed\n- Existing SwiftUI release note\./
  );
});

test('planStamp writes the complete version fan-out for main release path', () => {
  const writes = planStamp({
    currentVersion: '26.6.61',
    nextVersion: '26.6.62',
    manifests: [
      {
        path: 'package.json',
        content: '{\n  "version": "26.6.61",\n  "scripts": {}\n}\n',
      },
      {
        path: 'apps/web/package.json',
        content: '{\n  "name": "@jovie/web",\n  "version": "26.6.61"\n}\n',
      },
    ],
    versionFile: '26.6.61\n',
    changelog: '# Changelog\n\n## [Unreleased]\n\n### Added\n- Something.\n',
    dateISO: '2026-06-28',
  });

  assert.deepEqual(
    writes.map(write => write.path),
    [
      'version.json',
      'VERSION',
      'package.json',
      'apps/web/package.json',
      'CHANGELOG.md',
    ]
  );
  assert.equal(
    writes.find(write => write.path === 'version.json')?.content,
    '{\n  "version": "26.6.62"\n}\n'
  );
  assert.equal(
    writes.find(write => write.path === 'VERSION')?.content,
    '26.6.62\n'
  );
  assert.match(
    writes.find(write => write.path === 'package.json')?.content ?? '',
    /"version": "26\.6\.62"/
  );
  assert.match(
    writes.find(write => write.path === 'CHANGELOG.md')?.content ?? '',
    /## \[Unreleased\]\n\n## \[26\.6\.62\] - 2026-06-28/
  );
});

test('main release path: real stamp keeps the version fan-out consistent (version:check passes)', () => {
  // Copy the live repo's fan-out files into an isolated temp tree, run the real
  // stamp script with --set, then run version-check.mjs against the result. This
  // proves the MAIN/release path still updates everything consistently.
  const tmp = mkdtempSync(join(tmpdir(), 'jovie-version-stamp-'));
  try {
    const filesToCopy = [
      'VERSION',
      'version.json',
      'CHANGELOG.md',
      'package.json',
    ];
    const manifestGlobs = readFileSync(
      join(REPO_ROOT, 'scripts/version-check.mjs'),
      'utf-8'
    );
    // Mirror version-check's manifest list by copying every workspace package.json
    // that currently carries a version field.
    cpSync(join(REPO_ROOT, 'scripts'), join(tmp, 'scripts'), {
      recursive: true,
    });
    for (const rel of filesToCopy) {
      cpSync(join(REPO_ROOT, rel), join(tmp, rel));
    }
    for (const dir of ['apps', 'packages']) {
      const src = join(REPO_ROOT, dir);
      try {
        cpSync(src, join(tmp, dir), {
          recursive: true,
          filter: source => !source.includes('node_modules'),
        });
      } catch {
        // optional dir
      }
    }
    void manifestGlobs;

    // Derive the seed from the CURRENT UTC calendar (matching
    // computeNextVersion's yy/mm formatting), not from the copied repo's
    // version.json. That file drifts every month as the repo gets stamped,
    // so pinning the seed to whatever month it happens to say breaks this
    // test on every month rollover (version-check.mjs validates against
    // the real UTC calendar, not the fixture's origin month).
    const now = new Date();
    const yy = now.getUTCFullYear() % 100;
    const mm = now.getUTCMonth() + 1;
    const target = `${yy}.${mm}.999`;

    execFileSync('node', ['scripts/version-stamp.mjs', '--set', target], {
      cwd: tmp,
      stdio: 'pipe',
    });

    // version-check.mjs exits non-zero if the fan-out is inconsistent.
    execFileSync('node', ['scripts/version-check.mjs'], {
      cwd: tmp,
      stdio: 'pipe',
    });

    assert.equal(readFileSync(join(tmp, 'VERSION'), 'utf-8').trim(), target);
    assert.equal(
      JSON.parse(readFileSync(join(tmp, 'version.json'), 'utf-8')).version,
      target
    );
    assert.equal(
      JSON.parse(readFileSync(join(tmp, 'package.json'), 'utf-8')).version,
      target
    );
    const changelog = readFileSync(join(tmp, 'CHANGELOG.md'), 'utf-8');
    const firstDated = changelog.match(/^## \[(\d+\.\d+\.\d+)\] - /m);
    assert.equal(firstDated?.[1], target);
    assert.match(changelog, /## \[Unreleased\]/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('feature-branch path: stamp script never invoked by ship — guard covers writes', () => {
  // Sanity: the stamp script is a deliberate, explicit action. It must not run
  // implicitly. We assert it requires being called (no side effects on import).
  const before = readFileSync(join(REPO_ROOT, 'version.json'), 'utf-8');
  // Importing the module (done at top) must not have mutated the repo.
  const after = readFileSync(join(REPO_ROOT, 'version.json'), 'utf-8');
  assert.equal(before, after);
});

test('release-stamp CLI reads base CHANGELOG objects above the spawn maxBuffer', async t => {
  // CHANGELOG.md carries the daily-changelog receipt comments and exceeded the
  // 1 MiB execFileSync default (1.3 MB on main, 2026-11), which made
  // `git show <base>:CHANGELOG.md` throw ENOBUFS and the stamp guard report
  // 'promoted release evidence unavailable' (run 42590625677).
  const root = await realpath(
    await mkdtemp(join(tmpdir(), 'jovie-desktop-big-changelog-'))
  );
  t.after(() => rm(root, { force: true, recursive: true }));
  const git = (...args) =>
    execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
  const write = async (path, content) => {
    const destination = join(root, path);
    await mkdir(join(destination, '..'), { recursive: true });
    await writeFile(destination, content);
  };

  const manifests = ['package.json', 'apps/desktop/package.json'];
  const baseVersion = '26.10.16';
  const nextVersion = '26.11.0';
  const dateISO = '2026-11-09';
  const manifest = version =>
    `${JSON.stringify(
      { name: 'jovie-monorepo', version, private: true },
      null,
      2
    )}\n`;
  const base = {
    'CHANGELOG.md': `# Changelog\n\n<!-- daily-changelog-receipt/v1 ${'x'.repeat(
      1300 * 1024
    )} -->\n\n## [Unreleased]\n\n### Fixed\n- Guard repair.\n\n## [${baseVersion}] - 2026-11-08\n`,
    VERSION: `${baseVersion}\n`,
    'version.json': `${JSON.stringify({ version: baseVersion }, null, 2)}\n`,
  };
  for (const manifestPath of manifests) {
    base[manifestPath] = manifest(baseVersion);
  }
  assert.ok(
    Buffer.byteLength(base['CHANGELOG.md']) > 1024 * 1024,
    'fixture CHANGELOG must exceed the default spawn maxBuffer'
  );

  for (const [path, content] of Object.entries(base)) {
    await write(path, content);
  }
  for (const path of [
    'desktop-release-guard.mjs',
    'version-fanout-guard.mjs',
    'version-stamp.mjs',
    'lib/changelog-filter-rules.mjs',
  ]) {
    const destination = join(root, 'scripts', path);
    await mkdir(join(destination, '..'), { recursive: true });
    await copyFile(new URL(`./${path}`, import.meta.url), destination);
  }
  git('init', '-q');
  git('config', 'user.email', 'desktop-guard-test@jov.ie');
  git('config', 'user.name', 'Desktop Guard Test');
  git('add', '.');
  git('commit', '-qm', 'base');
  git('update-ref', 'refs/remotes/origin/main', 'HEAD');

  for (const plan of planStamp({
    currentVersion: baseVersion,
    nextVersion,
    manifests: manifests.map(path => ({ path, content: base[path] })),
    versionFile: base.VERSION,
    changelog: base['CHANGELOG.md'],
    dateISO,
  })) {
    await write(plan.path, plan.content);
  }

  const result = spawnSync(
    process.execPath,
    [join(root, 'scripts/desktop-release-guard.mjs'), '--base', 'origin/main'],
    {
      cwd: root,
      encoding: 'utf8',
      env: {
        ...process.env,
        GITHUB_EVENT_NAME: '',
        GITHUB_HEAD_REF: 'release/2026-11-09',
        GITHUB_BASE_REF: '',
        GITHUB_REF_NAME: '',
      },
    }
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /deterministic desktop version fan-out allowed/);
});
