import assert from 'node:assert/strict';
import test from 'node:test';
import {
  evaluateVersionFanoutGuard,
  isStampAllowedBranch,
} from './version-fanout-guard.mjs';

const versionedManifests = [
  'package.json',
  'apps/web/package.json',
  'packages/ui/package.json',
];

function evaluate({
  branch = 'tim/feature',
  changedFiles,
  base = {},
  head = {},
}) {
  return evaluateVersionFanoutGuard({
    branch,
    changedFiles,
    versionedManifests,
    getBaseContent: path => base[path],
    getHeadContent: path => head[path],
  });
}

test('enforces fan-out guard on normal feature branches', () => {
  assert.equal(isStampAllowedBranch('tim/jov-1234'), false);
  assert.equal(isStampAllowedBranch('feature/release-card'), false);
});

test('allows version stamping on main and release/integration branches', () => {
  assert.equal(isStampAllowedBranch('main'), true);
  assert.equal(isStampAllowedBranch('origin/main'), true);
  assert.equal(isStampAllowedBranch('release/2026-06-28'), true);
  assert.equal(isStampAllowedBranch('hotfix/production-version'), true);
  assert.equal(isStampAllowedBranch('train/ui'), true);
  assert.equal(isStampAllowedBranch('integration/release-train'), true);
});

test('allows merge-queue synthetic heads (source branch already enforced)', () => {
  assert.equal(
    isStampAllowedBranch(
      'gh-readonly-queue/main/pr-14658-21ed4be61ae4479d8a9bf209ce48f54a153e73b2'
    ),
    true
  );
});

test('fails when a feature branch edits scalar version files', () => {
  const result = evaluate({ changedFiles: ['VERSION'] });

  assert.equal(result.passed, false);
  assert.match(result.violations[0], /VERSION/);
});

test('fails when a feature branch changes version.json version', () => {
  const result = evaluate({
    changedFiles: ['version.json'],
    base: { 'version.json': '{"version":"26.6.61"}' },
    head: { 'version.json': '{"version":"26.6.62"}' },
  });

  assert.equal(result.passed, false);
  assert.match(result.violations[0], /version\.json/);
});

test('fails when a feature branch changes package.json version fields', () => {
  const result = evaluate({
    changedFiles: ['package.json', 'apps/web/package.json'],
    base: {
      'package.json': '{"version":"26.6.61","scripts":{"test":"node --test"}}',
      'apps/web/package.json':
        '{"version":"26.6.61","dependencies":{"x":"1.0.0"}}',
    },
    head: {
      'package.json': '{"version":"26.6.62","scripts":{"test":"node --test"}}',
      'apps/web/package.json':
        '{"version":"26.6.62","dependencies":{"x":"1.0.0"}}',
    },
  });

  assert.equal(result.passed, false);
  assert.equal(result.violations.length, 2);
});

test('allows feature branch package.json dependency/script edits when version field is unchanged', () => {
  const result = evaluate({
    changedFiles: ['package.json', 'apps/web/package.json'],
    base: {
      'package.json': '{"version":"26.6.61","scripts":{"test":"node --test"}}',
      'apps/web/package.json':
        '{"version":"26.6.61","dependencies":{"x":"1.0.0"}}',
    },
    head: {
      'package.json':
        '{"version":"26.6.61","scripts":{"test":"node --test scripts/*.test.mjs"}}',
      'apps/web/package.json':
        '{"version":"26.6.61","dependencies":{"x":"1.0.1"}}',
    },
  });

  assert.equal(result.passed, true);
  assert.deepEqual(result.violations, []);
});

test('allows feature branch CHANGELOG notes under Unreleased', () => {
  const result = evaluate({
    changedFiles: ['CHANGELOG.md'],
    base: {
      'CHANGELOG.md':
        '# Changelog\n\n## [26.6.61] - 2026-06-28\n\n### Added\n- Old\n\n## [Unreleased]\n',
    },
    head: {
      'CHANGELOG.md':
        '# Changelog\n\n## [26.6.61] - 2026-06-28\n\n### Added\n- Old\n\n## [Unreleased]\n\n### Added\n- New note\n',
    },
  });

  assert.equal(result.passed, true);
});

test('fails when a feature branch adds a dated CHANGELOG release heading', () => {
  const result = evaluate({
    changedFiles: ['CHANGELOG.md'],
    base: {
      'CHANGELOG.md':
        '# Changelog\n\n## [26.6.61] - 2026-06-28\n\n## [Unreleased]\n',
    },
    head: {
      'CHANGELOG.md':
        '# Changelog\n\n## [26.6.62] - 2026-06-28\n\n### Changed\n- Stamp\n\n## [26.6.61] - 2026-06-28\n\n## [Unreleased]\n',
    },
  });

  assert.equal(result.passed, false);
  assert.match(result.violations[0], /CHANGELOG\.md/);
  assert.match(result.violations[0], /26\.6\.62/);
});

test('does not enforce on main release path', () => {
  const result = evaluate({
    branch: 'main',
    changedFiles: ['VERSION', 'version.json', 'package.json', 'CHANGELOG.md'],
    base: {
      'version.json': '{"version":"26.6.61"}',
      'package.json': '{"version":"26.6.61"}',
      'CHANGELOG.md': '# Changelog\n\n## [Unreleased]\n',
    },
    head: {
      'version.json': '{"version":"26.6.62"}',
      'package.json': '{"version":"26.6.62"}',
      'CHANGELOG.md': '# Changelog\n\n## [26.6.62] - 2026-06-28\n',
    },
  });

  assert.equal(result.passed, true);
  assert.equal(result.enforced, false);
});
