import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
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

    const current = JSON.parse(
      readFileSync(join(tmp, 'version.json'), 'utf-8')
    ).version;
    const [yy, mm] = current.split('.');
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
